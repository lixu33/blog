---
isTimeLine: true
title: Redis Principles and High Availability Solutions
description: "Redis command execution model, SDS and listpack encodings, RDB/AOF persistence, and the leader election conditions and data-loss boundaries of the three high-availability solutions: master-replica, Sentinel, and Cluster. Includes 6.0 multithreaded I/O, 7.0 ziplist retirement, and changes to the AOF multi-file format."
date: 2024-10-14
updated: 2026-10-31
tags:
- Redis
- Cache
- High performance
categories:
- Backend Technology
- Backend
- Database Technology
head:
- - meta
  - name: keywords
    content: Redis,In-memory database,High performance,High Availability,SDS,listpack,Compressed list,Hash slot,Cluster,Sentinel
translatedFrom: 31d586a2072f84b1
---
# Redis Principles and High-Availability Solutions

A cache hit rate dropping below 90%, clients still connecting to the old master after Sentinel failover, and multi-key commands reporting `CROSSSLOT` after Cluster scaling—the root causes of all three lie in the execution model, replication method, and sharding rules, not in business code.

The following explains in the order of "how commands are executed → what encoding the data uses → how it is persisted and replicated → the conditions and costs of the three high-availability solutions." Each section ends with the corresponding configuration items.

## Three Things to Remember First

1. **Single-threaded refers to command execution**. Network reads and writes can be multi-threaded since 6.0, but a command still exclusively occupies the main thread from parsing to completion; a slow command blocks the entire instance.
2. **7.0 is a watershed**: `ziplist` was replaced by `listpack`, AOF changed to multiple files (base + incr + manifest), and cluster slot-related commands did not change.
3. **Cluster has only 16384 slots, and replication is asynchronous**. The primary node can return once the write is acknowledged, so writes at the instant of failover cannot be guaranteed not to be lost.

## 1. Execution Model

### 1.1 Event Loop and I/O Multiplexing

Redis uses a single event loop to listen to all client connections simultaneously (`epoll` on Linux), turning "readable," "writable," and "timed tasks" into event callbacks. This lets a single thread handle tens of thousands of connections, eliminating the stack and context-switching overhead of one thread per connection.

```c
int main(int argc, char **argv) {
    initServer();
    aeMain(server.el);          // 事件循环，内含 aeProcessEvents
    aeDeleteEventLoop(server.el);
    return 0;
}
```

The order inside `aeMain` is: process expired time events → block waiting for file events → process file events → process `beforeSleep` (flush the AOF buffer to disk, process cluster messages, etc.).

### 1.2 Multi-threaded I/O After 6.0

`io-threads` defaults to 1 (i.e., disabled). When set to 4, command reading, protocol parsing, and reply writing are distributed across multiple threads, but **command execution remains single-threaded**, so there is no need to consider concurrency safety for data structures.

The benefit of increasing it only appears when network I/O becomes the bottleneck (typically when a single instance reaches over 150,000 QPS, CPU is saturated, but `used_cpu_sys` accounts for a high proportion). In purely memory-operation-intensive scenarios, increasing it instead adds thread synchronization overhead:

```properties
io-threads 4
io-threads-do-reads yes
```

### 1.3 Which Operations Block the Main Thread

| Operation | Reason for Blocking |
|---|---|
| `KEYS *`, `HGETALL` on a large hash | Traverses all elements at once, O(N) |
| `DEL` on a large key | The time to free memory is spent on the caller's thread |
| `FLUSHALL`, `SAVE` | Full traversal / synchronous disk write |
| Lua script execution exceeding `lua-time-limit` | Scripts cannot be interrupted; only `SCRIPT KILL` is possible (when no data has been written) |

For deleting large keys, use `UNLINK` instead (reclaimed by a background thread); for traversal, use `SCAN` instead (cursor-based, returning only a small amount each time). Eviction when `used_memory > maxmemory` is also done on the main thread, and the sample count is controlled by `maxmemory-samples`.

## 2. Objects and Encodings

All values are wrapped as `robj`; `type` is the logical type (string/list/hash/set/zset), and `encoding` is the actual memory layout:

```c
struct redisObject {
    unsigned type:4;
    unsigned encoding:4;
    unsigned lru:LRU_BITS;   /* LRU 时间戳，开启 LFU 时存访问计数 */
    int refcount;
    void *ptr;
};
```

`refcount` allows integers from 0 to 9999 to share the same object, and `OBJECT ENCODING key` directly shows the current encoding of a key.

### 2.1 Encodings and Thresholds for Small Collections

| Type | Small-collection encoding | Threshold parameter |
|---|---|---|
| string | `int` / `embstr` | Uses `embstr` within 44 bytes |
| hash | `listpack` | `hash-max-listpack-entries` |
| list | `quicklist` (nodes are listpack) | `list-max-listpack-size` |
| set | `intset` (all integers) | `set-max-intset-entries` |
| zset | `listpack` | `zset-max-listpack-entries` |

When the threshold is exceeded or an element length exceeds the limit (`*-max-listpack-value`, default 64), it converts to a regular structure such as `hashtable` / `skiplist`. **The conversion is one-way**; even if elements are deleted below the threshold, it will not convert back. This is also why "after writing hundreds of thousands of fields into a hash, memory multiplies several times."

### 2.2 listpack and the Retired ziplist

Starting with Redis 7.0, the small-collection encoding for hash and zset changed to `listpack`; starting with 7.2, the quicklist nodes for list were also unified as listpack, and `ziplist` remains only in the old RDB compatibility read path. `listpack` removes `ziplist`'s `zltail` field and the `prevlen` chain length, so there is no cascading update problem.

The `listpack` layout:

```
<total-bytes><num-elements><entry>...<entry><0xFF>
```

Each entry consists of "encoding byte + data + variable-length backlen." `backlen` records its own length and is used for reverse traversal, replacing the `prevlen` in ziplist that causes cascading updates.

Its memory-saving principle: integers are encoded according to their actual size (7-bit, 13-bit, 16/24/32/64-bit), strings omit pointers and struct headers, and elements are stored contiguously without fragmentation. The cost is that insertion and deletion require O(N) memory moves, so it is only used for small collections.

## 3. Strings: SDS

Redis does not use C strings directly. After 3.2, there are five header types—`sdshdr5/8/16/32/64`—chosen by length, selecting the smallest one as needed:

```c
struct __attribute__ ((__packed__)) sdshdr8 {
    uint8_t len;        /* 已用长度 */
    uint8_t alloc;      /* 已分配容量，不含头和结尾 \0 */
    unsigned char flags;/* 低 3 位标识头类型 */
    char buf[];
};
```

This brings four properties:

1. `len` is directly available, so `STRLEN` is O(1); there is no need to scan to `\0` as in C.
2. Before appending, it checks `alloc` and expands if there is not enough space, so it will not overflow.
3. Expansion uses preallocation (double when less than 1MB; reserve an extra 1MB when greater than 1MB), and with `alloc` recording capacity, the number of `realloc` calls for consecutive `APPEND` operations is greatly reduced.
4. Length is determined by `len` rather than `\0`, so arbitrary binary data can be stored, including `\0`.

`embstr` places `robj` and `sdshdr8` in one contiguous memory block allocated at once, used when the length is ≤44 bytes, saving one `malloc`; beyond that, `raw` is used, with `ptr` pointing separately to the SDS.

## 4. Persistence

| Method | Trigger | Loss window |
|---|---|---|
| RDB | `save` rules / `BGSAVE` | Between two snapshots |
| AOF (`everysec`) | Flush to disk every second | About 1 second |
| RDB + AOF mixed | AOF rewrite starts with RDB | About 1 second |

### 4.1 RDB and the Cost of fork

`BGSAVE` forks a child process to write the snapshot while the parent process continues serving, sharing memory pages via COW (copy-on-write). The more frequent the writes, the more pages need to be copied, and the memory peak may approach twice the normal amount, so when configuring `maxmemory`, leave headroom for fork.

`SAVE` is synchronous and blocks the entire instance until writing is complete; in production, use only `BGSAVE`.

### 4.2 AOF's Multi-file Format

Before 7.0, AOF was a single file, and rewriting relied on `aof-rewrite-incremental-fsync` to mitigate disk jitter. Starting with 7.0, it changed to three parts under the `appenddirname` directory:

- `*.base.rdb`: the base snapshot generated by rewrite (RDB format)
- `*.incr.aof`: incremental commands
- `*.manifest`: records which files are currently in use

The benefit is that rewriting no longer requires renaming a large file, and there is no longer the problem of "a failed rewrite making AOF unavailable." Among the three values of `appendfsync`, `always` fsyncs every command (throughput drops by an order of magnitude), `everysec` is the default and recommended compromise, and `no` leaves the timing of flushing to disk to the kernel.

## V. High Availability

### 5.1 Master-Replica Replication

After a replica executes `REPLICAOF host port`, it goes through three steps: establish a connection and `PING` → authenticate, send `REPLCONF` to get the `runid` and `offset` → `PSYNC`.

- If the `runid` matches and the offset is still within the master's `repl-backlog` (ring buffer, size `repl-backlog-size`) range, **incremental synchronization** is used, and only the missing commands are sent
- Otherwise, **full synchronization** is used: the master runs `BGSAVE` to generate and transfer an RDB, new writes during this period are buffered in the client buffer, and are sent after the RDB transfer completes

Replication is **asynchronous**: the master returns to the client after executing the command and does not wait for replica acknowledgment. If the network jitters or a replica is blocked for longer than `repl-backlog-size`, it degrades to full synchronization. This is a common cause of "replication lag suddenly increases and network traffic saturates"; increasing `repl-backlog-size` can mitigate it.

### 5.2 Sentinel

Sentinel itself is a standalone process, usually deployed as 3 or 5 instances, monitoring masters and replicas, performing failover, and providing clients with the new master address.

Detection has two layers: if a single Sentinel cannot ping within `down-after-milliseconds`, it marks **subjective down** (SDOWN); only when `quorum` Sentinels all agree is it marked **objective down** (ODOWN) and an election is triggered.

Two easy misconfigurations:

- `quorum` only determines "when to mark down"; **actually performing failover requires a majority of Sentinels to elect a leader** (N/2+1), so with 3 Sentinels and `quorum` set to 2, if 2 go down, failover still cannot occur
- After failover, if the old master recovers, it is demoted to a replica, but if clients have cached the address, they need Sentinel awareness or the client library's subscription mechanism to update; otherwise they will keep writing to the old master

### 5.3 Cluster

Cluster shards by slot: 16384 slots are evenly distributed among master nodes, and each master has several replicas. The slot count is fixed at 16384 rather than a larger number because nodes exchange slot bitmaps via gossip, and bitmap size directly affects heartbeat packet size.

```c
unsigned int keyHashSlot(char *key, int keylen) {
    return crc16(key, keylen) & 16383;
}
```

Note that it is **CRC16 followed by bitwise AND with 16383**, not "hash the key and then take modulo." Bitwise AND requires the slot count to be a power of 2, which is also the origin of 16384.

**hash tag**: if a key contains `{...}`, only the part inside the braces is used for CRC16. `{user:1}:name` and `{user:1}:age` fall into the same slot. Multi-key commands (`MGET`, `SUNION`, Lua, transactions) must rely on this to ensure they are in the same slot; otherwise they report `CROSSSLOT Keys in request don't hash to the same slot`.

Complete conditions for failover:

1. A replica has lost contact with its master for longer than `cluster-node-timeout`, and the master is marked `FAIL` by a majority of slot-holding masters
2. The replica checks whether its own data is too stale (`cluster-replica-validity-factor`); if too stale, it does not participate in the election
3. It canvasses votes from slot-holding masters and, **upon obtaining a majority**, is promoted and takes over the original master's slots
4. The remaining replicas switch to replicating the new master

If only one master is down but the cluster as a whole loses the majority of masters (for example, 2 masters out of 3 masters and 3 replicas go down), the cluster stops serving and reports `CLUSTERDOWN`. This is the behavior of `cluster-require-full-coverage yes` (the default).

### 5.4 Consistency Boundaries

Redis replication is asynchronous, so writes on the master that have not yet been synchronized at the moment of failure will be lost. `WAIT` can block the client until a specified number of replicas acknowledge:

```redis
SET key value
WAIT 1 0
```

It returns the number of replicas that actually acknowledged; `0` means no timeout is set. However, it only guarantees "reached N replicas," not persistence to disk; and if one of these replicas is promoted to master, writes on the remaining replicas may still be rolled back (`min-replicas-to-write` only rejects writes and does not change replication semantics). In scenarios requiring strong consistency, the decision basis should be placed in storage that supports consensus.

## VI. Common Issue Reference

| Symptom | Common Cause |
|---|---|
| Occasional timeouts, records in `SLOWLOG` | `DEL`/`HGETALL` on a big key, or a full scan with `KEYS` |
| Memory keeps rising, `MEMORY USAGE` spikes | A small collection's encoding converts to hashtable, or a large element is put into a listpack |
| Replication lag suddenly increases, traffic doubles | Full synchronization, insufficient `repl-backlog-size`, or a blocked replica |
| Sentinel does not fail over | Not enough Sentinels for a majority, or `quorum` is misconfigured relative to the number of instances |
| `CROSSSLOT` / `MOVED` loop | Multi-key commands do not use hash tags; the client does not handle redirection |
| `OOM command not allowed` | `maxmemory` is full and `maxmemory-policy` is `noeviction` |

## Related Reading

- [Kafka Storage and Replication Mechanisms](/en/backend/kafka): an asynchronous message path beyond caching
- [Spring Boot Auto-Configuration and Startup Flow](/en/backend/springBoot): where cache integration and invalidation strategies land
- [Spring Container, AOP, and Declarative Transaction Implementation](/en/backend/spring): the relationship between caching and container beans
- [AES and RSA: How to Choose Symmetric and Asymmetric Encryption](/en/security/aes): encryption methods for sensitive data in caches

## References

- [Redis Official Documentation](https://redis.io/docs/latest/)
- [Redis Persistence (RDB / AOF)](https://redis.io/docs/latest/operate/oss_and_stack/management/persistence/)
- [Redis Cluster Specification](https://redis.io/docs/latest/operate/oss_and_stack/reference/cluster-spec/)
- [Sentinel High Availability Documentation](https://redis.io/docs/latest/operate/oss_and_stack/management/sentinel/)