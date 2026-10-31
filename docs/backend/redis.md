---
isTimeLine: true
title: Redis 原理与高可用方案
description: Redis 的命令执行模型、SDS 与 listpack 编码、RDB/AOF 持久化，以及主从、Sentinel、Cluster 三种高可用方案的选主条件与数据丢失边界。含 6.0 多线程 I/O、7.0 ziplist 退役与 AOF 多文件格式的变化。
date: 2024-10-14
updated: 2026-10-31
tags:
- Redis
- 缓存
- 高性能
categories:
- 后端技术
- Backend
- 数据库技术
head:
- - meta
  - name: keywords
    content: Redis,内存数据库,高性能,高可用性,SDS,listpack,压缩列表,哈希槽,Cluster,Sentinel
---

# Redis 原理与高可用方案

缓存命中率掉到 90% 以下、Sentinel 切换后客户端还在连旧主、Cluster 扩容后多 key 命令报 `CROSSSLOT`——这三类问题的根都在执行模型、复制方式和分片规则上，不在业务代码。

下面按「命令怎么被执行 → 数据用什么编码 → 怎么落盘和复制 → 三种高可用方案的条件与代价」的顺序讲，每节末尾给出对应的配置项。

## 先记住三条

1. **单线程指的是命令执行**。网络读写从 6.0 起可以多线程，但一条命令从解析到执行完仍然独占主线程，慢命令会阻塞整个实例
2. **7.0 是分水岭**：`ziplist` 被 `listpack` 取代，AOF 改成多文件（base + incr + manifest），集群槽位相关的命令没有变化
3. **Cluster 只有 16384 个槽，复制是异步的**，主节点确认写入即可返回，切换瞬间的写入无法保证不丢

## 一、执行模型

### 1.1 事件循环与 I/O 多路复用

Redis 用一个事件循环同时监听所有客户端连接（Linux 上是 `epoll`），把「可读」「可写」「定时任务」都转成事件回调。这样单个线程就能扛住上万连接，省掉了每连接一线程的栈和切换开销。

```c
int main(int argc, char **argv) {
    initServer();
    aeMain(server.el);          // 事件循环，内含 aeProcessEvents
    aeDeleteEventLoop(server.el);
    return 0;
}
```

`aeMain` 里的顺序是：处理到期的时间事件 → 阻塞等待文件事件 → 处理文件事件 → 处理 `beforeSleep`（把 AOF 缓冲区刷盘、处理集群消息等）。

### 1.2 6.0 之后的多线程 I/O

`io-threads` 默认是 1（即不开）。设为 4 时，命令的读取、协议解析和回复写回分散到多个线程，**命令执行仍然是单线程**，所以不需要考虑数据结构并发安全。

调大的收益只在网络 I/O 成为瓶颈时出现（通常单实例跑到 15 万 QPS 以上、CPU 打满但 `used_cpu_sys` 占比高）。纯内存操作密集的场景调大反而增加线程同步开销：

```properties
io-threads 4
io-threads-do-reads yes
```

### 1.3 哪些操作会阻塞主线程

| 操作 | 阻塞原因 |
|---|---|
| `KEYS *`、`HGETALL` 大 hash | 一次性遍历全部元素，O(N) |
| `DEL` 大 key | 释放内存的耗时在调用方线程完成 |
| `FLUSHALL`、`SAVE` | 全量遍历 / 同步落盘 |
| Lua 脚本执行超过 `lua-time-limit` | 脚本不可中断，只能 `SCRIPT KILL`（未写过数据时） |

大 key 的删除改用 `UNLINK`（后台线程回收），遍历改用 `SCAN`（游标式，每次只返回少量）。`used_memory > maxmemory` 时的淘汰也在主线程做，样本数由 `maxmemory-samples` 控制。

## 二、对象与编码

所有值都包装成 `robj`，`type` 是逻辑类型（string/list/hash/set/zset），`encoding` 是实际的内存布局：

```c
struct redisObject {
    unsigned type:4;
    unsigned encoding:4;
    unsigned lru:LRU_BITS;   /* LRU 时间戳，开启 LFU 时存访问计数 */
    int refcount;
    void *ptr;
};
```

`refcount` 让 0~9999 的整数共享同一份对象，`OBJECT ENCODING key` 可以直接看到某个 key 当前的编码。

### 2.1 小集合的编码与阈值

| 类型 | 小集合编码 | 阈值参数 |
|---|---|---|
| string | `int` / `embstr` | 44 字节以内用 `embstr` |
| hash | `listpack` | `hash-max-listpack-entries` |
| list | `quicklist`（节点是 listpack） | `list-max-listpack-size` |
| set | `intset`（全整数） | `set-max-intset-entries` |
| zset | `listpack` | `zset-max-listpack-entries` |

超过阈值或元素长度超限（`*-max-listpack-value`，默认 64）就转成 `hashtable` / `skiplist` 等常规结构，**转换是单向的**，删到阈值以下也不会转回来。这也是「一个 hash 写进去几十万字段后内存翻几倍」的原因。

### 2.2 listpack 与退场的 ziplist

Redis 7.0 起 hash、zset 的小集合编码改为 `listpack`，7.2 起 list 的 quicklist 节点也统一为 listpack，`ziplist` 只剩旧的 RDB 兼容读取路径保留。`listpack` 去掉了 `ziplist` 的 `zltail` 字段和 `prevlen` 链式长度，因此没有级联更新问题。

`listpack` 的布局：

```
<total-bytes><num-elements><entry>...<entry><0xFF>
```

每个 entry 由「编码字节 + 数据 + 变长 backlen」组成，`backlen` 记录自身长度，用于从后往前遍历，替代了 ziplist 里会导致级联更新的 `prevlen`。

它的省内存原理：整数按实际大小编码（7 位、13 位、16/24/32/64 位）、字符串去掉指针和结构体头、元素连续存放不产生碎片。代价是插入删除为 O(N) 内存移动，所以只在小集合上使用。

## 三、字符串：SDS

Redis 没有直接用 C 字符串。3.2 之后按长度分为 `sdshdr5/8/16/32/64` 五种头，按需选最小的一种：

```c
struct __attribute__ ((__packed__)) sdshdr8 {
    uint8_t len;        /* 已用长度 */
    uint8_t alloc;      /* 已分配容量，不含头和结尾 \0 */
    unsigned char flags;/* 低 3 位标识头类型 */
    char buf[];
};
```

带来的四个性质：

1. `len` 直接可得，`STRLEN` 是 O(1)，不必像 C 那样扫到 `\0`
2. 追加前检查 `alloc`，不够就扩容，不会越界
3. 扩容采用预分配（小于 1MB 时翻倍，大于 1MB 时多留 1MB），配合 `alloc` 记录容量，连续 `APPEND` 的 `realloc` 次数大幅减少
4. 长度由 `len` 决定而非 `\0`，可以存任意二进制，包括 `\0`

`embstr` 是把 `robj` 和 `sdshdr8` 放在一块连续内存里一次分配，长度 ≤44 字节时使用，省掉一次 `malloc`；超过则用 `raw`，`ptr` 单独指向 SDS。

## 四、持久化

| 方式 | 触发 | 丢失窗口 |
|---|---|---|
| RDB | `save` 规则 / `BGSAVE` | 两次快照之间 |
| AOF（`everysec`） | 每秒刷盘 | 约 1 秒 |
| RDB + AOF 混合 | AOF 重写时以 RDB 打头 | 约 1 秒 |

### 4.1 RDB 与 fork 的代价

`BGSAVE` 通过 `fork` 出子进程写快照，父进程继续服务，靠 COW（写时复制）共享内存页。写入越频繁，需要复制的页越多，内存峰值可能接近两倍，所以配置 `maxmemory` 时要给 fork 留余量。

`SAVE` 是同步的，会阻塞整个实例直到写完，生产环境只用 `BGSAVE`。

### 4.2 AOF 的多文件格式

7.0 之前 AOF 是单个文件，重写时靠 `aof-rewrite-incremental-fsync` 缓解磁盘抖动。7.0 起改为 `appenddirname` 目录下的三部分：

- `*.base.rdb`：重写生成的基础快照（RDB 格式）
- `*.incr.aof`：增量命令
- `*.manifest`：记录当前使用了哪些文件

好处是重写不再需要重命名大文件，也不再有「重写失败导致 AOF 不可用」的问题。`appendfsync` 的三个取值中 `always` 每条命令都 fsync（吞吐下降一个量级），`everysec` 是默认且推荐的折中，`no` 交给内核决定刷盘时机。

## 五、高可用

### 5.1 主从复制

从节点执行 `REPLICAOF host port` 后走三步：建立连接并 `PING` → 认证、发送 `REPLCONF` 拿到 `runid` 和 `offset` → `PSYNC`。

- 如果 `runid` 匹配且偏移量还在 master 的 `repl-backlog`（环形缓冲区，大小 `repl-backlog-size`）范围内，走**增量同步**，只补发缺失的命令
- 否则走**全量同步**：主节点 `BGSAVE` 生成 RDB 传输，期间的新写入缓存在 client buffer 里，RDB 传完再补发

复制是**异步**的：主节点执行完命令就返回客户端，不等从节点确认。网络抖动或从节点阻塞超过 `repl-backlog-size` 就会退化成全量同步，这是「主从延迟突然变大、网络流量打满」的常见原因，加大 `repl-backlog-size` 可以缓解。

### 5.2 Sentinel

Sentinel 本身是一个独立进程，通常部署 3 或 5 个，监控主从、执行切换、向客户端提供新主地址。

判定分两层：单个 Sentinel 在 `down-after-milliseconds` 内 ping 不通就标记**主观下线**（SDOWN）；达到 `quorum` 个 Sentinel 都这么认为，才标记**客观下线**（ODOWN）并触发选举。

容易配错的两点：

- `quorum` 只决定「何时判定下线」，**真正执行切换需要多数 Sentinel 选出 leader**（N/2+1），所以 3 个 Sentinel 的 `quorum` 写 2 时，挂掉 2 个仍然无法切换
- 切换后旧主恢复会被降级为从节点，但客户端如果缓存了地址，需要靠 Sentinel 感知或客户端库的订阅机制更新，否则会一直写旧主

### 5.3 Cluster

Cluster 按槽分片，16384 个槽平均分给各主节点，每个主节点带若干从节点。槽数固定为 16384 而非更大，是因为节点间用 gossip 交换槽位位图，位图大小直接影响心跳包体积。

```c
unsigned int keyHashSlot(char *key, int keylen) {
    return crc16(key, keylen) & 16383;
}
```

注意是 **CRC16 后按位与 16383**，不是「对 key 做哈希再取模」。位与要求槽数是 2 的幂，这也是 16384 的由来。

**hash tag**：key 里若含 `{...}`，只对花括号内的部分做 CRC16，`{user:1}:name` 和 `{user:1}:age` 会落到同一槽。跨 key 的命令（`MGET`、`SUNION`、Lua、事务）必须靠它保证同槽，否则报 `CROSSSLOT Keys in request don't hash to the same slot`。

故障转移的完整条件：

1. 从节点与主节点失联超过 `cluster-node-timeout`，且主节点被多数持有槽的主节点标记为 `FAIL`
2. 从节点检查自身数据是否过旧（`cluster-replica-validity-factor`），太旧则不参选
3. 向持有槽的主节点拉票，**拿到过半数**即晋升，并接管原主节点的槽
4. 其余从节点改为复制新主

只挂一个主节点但集群整体失去多数主节点时（例如 3 主 3 从里挂了 2 个主），集群会停止服务并报 `CLUSTERDOWN`，这是 `cluster-require-full-coverage yes`（默认）的行为。

### 5.4 一致性边界

Redis 复制是异步的，主节点在故障瞬间尚未同步的写入会丢失。`WAIT` 可以让客户端阻塞到指定数量的副本确认：

```redis
SET key value
WAIT 1 0
```

返回实际确认的副本数，`0` 表示不设超时。但它只保证「已到达 N 个副本」，不保证落盘；且这些副本中若有一个被提升为主，其余副本上的写入仍可能被回滚（`min-replicas-to-write` 只是拒绝写入，不改变复制语义）。需要强一致的场景，判定依据应该放在支持共识的存储里。

## 六、常见问题对照

| 现象 | 常见原因 |
|---|---|
| 偶发超时、`SLOWLOG` 有记录 | 大 key 的 `DEL`/`HGETALL`，或 `KEYS` 全扫 |
| 内存持续上涨、`MEMORY USAGE` 突增 | 小集合编码转成 hashtable，或 listpack 里塞了大元素 |
| 主从延迟突然增大、流量翻倍 | 全量同步，`repl-backlog-size` 不够或从节点阻塞 |
| Sentinel 不切换 | Sentinel 数量不足多数，或 `quorum` 与实例数配错 |
| `CROSSSLOT` / `MOVED` 循环 | 多 key 命令未用 hash tag；客户端未处理重定向 |
| `OOM command not allowed` | `maxmemory` 打满且 `maxmemory-policy` 为 `noeviction` |

## 相关阅读

- [Kafka 存储与复制机制](/backend/kafka)：缓存之外的异步消息路径
- [Spring Boot 自动配置与启动流程](/backend/springBoot)：缓存接入与失效策略的落地位置
- [深入 Spring 源码解析](/backend/spring)：缓存与容器 Bean 的关系

## 参考

- [Redis 官方文档](https://redis.io/docs/latest/)
- [Redis 持久化（RDB / AOF）](https://redis.io/docs/latest/operate/oss_and_stack/management/persistence/)
- [Redis Cluster 规范](https://redis.io/docs/latest/operate/oss_and_stack/reference/cluster-spec/)
- [Sentinel 高可用文档](https://redis.io/docs/latest/operate/oss_and_stack/management/sentinel/)
