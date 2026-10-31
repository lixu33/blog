---
isTimeLine: true
sticky: 3
title: Kafka 存储与复制机制
description: Kafka 的分区日志结构、副本同步与 ISR 选举、生产端分区与幂等、消费组 rebalance 机制。含 4.0 移除 ZooKeeper 后的配置变化，以及 acks 与 min.insync.replicas 的正确搭配。
date: 2024-05-20
updated: 2026-10-31
tags:
- Kafka
- 分布式系统
- 流处理
categories:
- 后端技术
- Backend
head:
- - meta
  - name: keywords
    content: Kafka,分区副本,ISR,KRaft,acks,min.insync.replicas,消费组 rebalance,幂等生产者
---

# Kafka 存储与复制机制

这篇讲 Kafka 的存储结构和副本同步，重点是几个互相依赖的参数：`acks`、`min.insync.replicas`、`max.poll.interval.ms`。先讲机制，再说这些参数怎么搭配。

## 先记住三件事

1. **顺序只在分区内成立**——需要全局有序就得单分区，代价是没有并行度
2. **可靠性 = `acks=all` + `min.insync.replicas>=2` + `replication.factor>=3`**，三者缺一个都不是真可靠
3. **分区数只能增不能减**，初始取值要一次算对

## 一、核心概念

| 概念 | 作用 |
|---|---|
| Topic | 消息的逻辑分类 |
| Partition | Topic 的物理分片，是有序日志的最小单位 |
| Broker | Kafka 服务节点，一个分区在同一时刻只有一个 leader 副本在此提供服务 |
| Replica | 副本，分布在不同的 broker 上 |
| Consumer Group | 消费组，组内每个分区只被一个消费者消费 |

### 关于 ZooKeeper

Kafka 2.8 引入 KRaft（用内部 Raft 共识替代 ZooKeeper），3.3 起生产可用，**4.0 已完全移除 ZooKeeper 支持**。新集群直接上 KRaft：

```properties
process.roles=broker,controller
node.id=1
controller.quorum.voters=1@host1:9093,2@host2:9093,3@host3:9093
```

老教程里的 `zookeeper.connect` 在 4.x 已无意义。

## 二、存储：分区就是追加日志

每个分区在磁盘上是若干**日志段**（`00000000000000000000.log` + `.index` + `.timeindex`）：

- 写入永远是追加到当前活跃段末尾，这让磁盘顺序写成为可能（顺序写吞吐远高于随机写）
- 段满（`segment.bytes`，默认 1GB）后滚动新段
- `.index` 是偏移量 → 物理位置的稀疏索引，`.timeindex` 是时间戳 → 偏移量索引；两者让「按 offset 或按时间查」不用全扫

**没有真实的 `LogSegment`/`ReplicaManager` Java 类可供你调用**——这些是 Kafka 内部实现，源码里存在但不作为 API 使用。网上很多「源码解析」贴出的 `public class LogSegment { ... }` 是示意，照抄编译不过。

清理策略：

| 策略 | 配置 | 行为 |
|---|---|---|
| delete | `cleanup.policy=delete` | 按 `retention.ms` / `retention.bytes` 删除旧段 |
| compact | `cleanup.policy=compact` | 每个 key 只保留最新值，适合「状态快照」类 topic（如 `__consumer_offsets`） |

## 三、生产端

### 3.1 分区选择

Kafka 2.4 之后默认分区器是**粘性分区**（Sticky Partitioner，3.3 起收敛为 `BuiltInPartitioner`）：没有 key 的消息会先填满一个批次再换分区，而不是逐条轮询。轮询会让批次变小，增大请求数。

- 有 key → `murmur2(key) % 分区数`，相同 key 恒定落同一分区（顺序性来源）
- 无 key → 粘性分区，**不保证顺序**
- 显式指定分区 → 直接使用

老版本里的 `DefaultPartitioner` 类已废弃，自定义分区器实现 `Partitioner` 接口即可，但多数场景没必要。

### 3.2 可靠性与幂等

```properties
# 生产端
acks=all
enable.idempotence=true
max.in.flight.requests.per.connection=5
retries=2147483647
```

`enable.idempotence=true` 后 Kafka 会给每个生产者分配 PID 并用序列号去重，重试不会产生重复消息——这是「至少一次」变「恰好一次（写入侧）」的关键，且不影响吞吐。

`acks` 的取值与含义：

| 值 | 含义 | 风险 |
|---|---|---|
| `0` | 发出即认为成功 | 丢消息无感知 |
| `1` | leader 写入即返回 | leader 宕机且未同步时丢消息 |
| `all`（`-1`） | ISR 全部写入才返回 | 需配合 `min.insync.replicas` |

**关键搭配**：`acks=all` 但 `min.insync.replicas=1` 时，ISR 只剩 leader 也算成功，等于 `acks=1`。正确组合是 `replication.factor=3` + `min.insync.replicas=2` + `acks=all`，此时可容忍 1 个 broker 故障不丢数据。

### 3.3 批处理配置

```properties
batch.size=32768        # 单批次字节上限，太小则频繁发请求
linger.ms=5             # 最多等 5ms 凑批，用少量延迟换吞吐
compression.type=lz4    # lz4 在多数场景是吞吐/CPU 的平衡点
buffer.memory=67108864
```

`linger.ms=0`（默认）在高吞吐场景下会让批次几乎总是只有一条，`batch.size` 形同虚设。

## 四、副本与选举

- 每个分区 1 个 leader + N 个 follower，读写都走 leader，follower 主动 fetch 拉取
- **ISR**（In-Sync Replicas）：与 leader 保持同步的副本集合（含 leader）。落后超过 `replica.lag.time.max.ms`（默认 30s）会被踢出
- leader 失效时，Controller 从 ISR 中选新 leader

`unclean.leader.election.enable`（默认 `false`）：允许非 ISR 副本当 leader，可用性优先但**可能丢数据**。默认关闭是对的，除非明确接受数据丢失换取可用性。

### 4.1 分区数怎么定

```bash
# 只能增加
kafka-topics.sh --bootstrap-server localhost:9092 \
  --alter --topic my-topic --partitions 12
```

估算顺序：

1. 目标吞吐（MB/s）÷ 单分区实测吞吐（一般 10-50 MB/s）→ 分区数下限
2. 消费者最大并行度 = 分区数，不能让分区数少于预期消费者数
3. 分区不是越多越好：每个分区在 broker 上都占文件句柄和内存，数千分区会显著拖慢 controller 故障恢复

## 五、消费端

### 5.1 位移与提交

- 位移存在内部 topic `__consumer_offsets`
- 自动提交 `enable.auto.commit=true` 时按 `auto.commit.interval.ms` 批量提交，**可能导致重复消费**（提交前崩溃，重启后从上次提交点重放）
- 需要精确控制时关掉自动提交，处理完业务逻辑后手动 `commitSync()`，或在批处理里用 `commitAsync()` + 兜底 `commitSync()`

### 5.2 Rebalance

消费者数量变化、分区数变化、消费者掉线（超过 `session.timeout.ms`）都会触发 rebalance，期间整个消费组暂停消费（stop-the-world）。

缓解手段：

| 配置 | 作用 |
|---|---|
| `partition.assignment.strategy=CooperativeStickyAssignor` | 增量式 rebalance，只迁移必要分区，不全体暂停 |
| `max.poll.interval.ms` | 两次 poll 的最大间隔，超时即视为消费者掉线——处理慢的任务要调大，或减少 `max.poll.records` |
| `session.timeout.ms` | 心跳超时，与 `heartbeat.interval.ms` 成比例（一般 3:1） |

「消费一段时间后反复 rebalance」几乎都是 `max.poll.interval.ms` 太小或单批处理太慢。

### 5.3 消费慢怎么办

```properties
max.poll.records=500
fetch.min.bytes=1
```

- 先把 `max.poll.records` 调小，保证单次处理时长 < `max.poll.interval.ms`
- 真正的瓶颈在业务处理时，加消费者而不是加线程（分区数上限就是并行度上限）

## 六、性能来源

| 机制 | 说明 |
|---|---|
| 顺序写 | 追加日志，避免磁盘寻道 |
| 零拷贝 | `sendfile` 把页缓存直接送网卡，省掉用户态拷贝 |
| 批处理 + 压缩 | 一次请求带一批，压缩后在网络与磁盘两侧都省 |
| 分区并行 | 多分区分散在不同 broker |
| 页缓存 | 读写都优先命中 OS 页缓存，尽量不用 JVM 堆 |

注意「零拷贝」的收益依赖消费者能跟上生产速度；消费者落后太多时走的是磁盘读，顺序写优势仍在但延迟上升。

## 七、常见故障对照

| 现象 | 常见原因 |
|---|---|
| 生产端 `TimeoutException` | `acks=all` 但 ISR 不足（broker 挂了或 `min.insync.replicas` 过高） |
| 消费延迟持续增长 | 消费者数 < 分区数，或单条处理太慢触发 rebalance |
| 反复 rebalance | `max.poll.interval.ms` 太小 / 处理逻辑阻塞 |
| 磁盘写满 | `retention.bytes` 没设，或 `cleanup.policy=compact` 但 key 无限增长 |
| 消息顺序错乱 | 无 key 走了粘性分区，或生产端 `max.in.flight` > 1 且关闭幂等 |

## 相关阅读

- [Redis 原理与高可用方案](/backend/redis)：缓存与消息队列的分工
- [Spring Boot 自动配置与启动流程](/backend/springBoot)：Spring 侧的消费者配置
- [Netty 的事件循环、Pipeline 与零拷贝](/backend/netty)：高吞吐场景下的自定义网络协议

## 参考

- [Kafka 官方文档：设计与实现](https://kafka.apache.org/documentation/#design)
- [KIP-500: Replace ZooKeeper with a Self-Managed Metadata Quorum](https://cwiki.apache.org/confluence/display/KAFKA/KIP-500)
- [KIP-429: Kafka Consumer Incremental Rebalance Protocol](https://cwiki.apache.org/confluence/display/KAFKA/KIP-429)
- [Kafka 生产者配置](https://kafka.apache.org/documentation/#producerconfigs)
