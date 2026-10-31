---
isTimeLine: true
title: Redis Principles and High Availability Solutions
description: "Redis command execution model, SDS and listpack encoding, RDB/AOF persistence, and the leader-election conditions and data-loss boundaries of the three high-availability schemes: master-replica, Sentinel, and Cluster. Includes 6.0 multi-threaded I/O, 7.0 ziplist retirement, and AOF multi-file format changes."
date: 2024-10-14
updated: 2026-10-31
tags:
- Redis
- Cache
- High Performance
categories:
- Backend Technology
- Backend
- Database Technology
head:
- - meta
  - name: keywords
    content: Redis,In-memory database,High performance,High Availability,SDS,listpack,Ziplist,Hash slot,Cluster,Sentinel
translatedFrom: f3fbbe9860818d52
---
# Redis Internals and High Availability Solutions

Cache hit rate drops below 90%, clients still connect to the old primary after a Sentinel failover, multi-key commands return `CROSSSLOT` after Cluster scale-out—the root causes of all three lie in the execution model, replication method, and sharding rules, not in business code.

The following proceeds in the order "how commands are executed → how data is encoded → how it is persisted and replicated → the conditions and costs of the three high-availability solutions", with the corresponding configuration items given at the end of each section.

## Three Things to Remember First

1. **Single-threaded refers to command execution**. Network reads/writes can be multithreaded since 6.0, but a command still exclusively occupies the main thread from parsing to completion, and a slow command blocks the entire instance
2. **7.0 is the turning point**: `ziplist` was replaced by `listpack`, AOF was changed to multiple files (base + incr + manifest), and commands related to cluster slots are unchanged
3. **Cluster has only 16,384 slots, and replication is asynchronous**; the primary returns once the write is acknowledged, so writes at the moment of failover cannot be guaranteed not to be lost

## 1. Execution Model

### 1.1 Event Loop and I/O Multiplexing

Redis uses a single event loop to monitor all client connections simultaneously (`epoll` on Linux), turning "readable", "writable", and "timed tasks" into event callbacks. This allows a single thread to handle tens of thousands of connections, eliminating the stack and context-switching overhead of one thread per connection.

```c
int main(int argc, char **argv) {
    initServer();
    aeMain(server.el);          // 事件循环，内含 aeProcessEvents
    aeDeleteEventLoop(server.el);
    return 0;
}
```

The order inside `aeMain` is: process expired time events → block waiting for file events → process file events → process `beforeSleep` (flush the AOF buffer to disk, process cluster messages, etc.).

### 1.2 Multithreaded I/O After 6.0

`io-threads` defaults to 1 (i.e., disabled). When set to 4, command reading, protocol parsing, and reply writing are distributed across multiple threads, **while command execution remains single-threaded**, so there is no need to consider concurrent safety of data structures.

The benefit of increasing it only appears when network I/O becomes the bottleneck (typically when a single instance reaches more than 150,000 QPS, CPU is saturated, but `used_cpu_sys` accounts for a high proportion). In scenarios with intensive pure in-memory operations, increasing it instead adds thread synchronization overhead:

```properties
io-threads 4
io-threads-do-reads yes
```

### 1.3 Which Operations Block the Main Thread

| Operation | Reason for Blocking |
|---|---|
| `KEYS *`, `HGETALL` on a large hash | Traverses all elements at once, O(N) |
| `DEL` on a large key | The time to free memory is spent on the caller's thread |
| `FLUSHALL`, `SAVE` | Full traversal / synchronous persistence |
| Lua script execution exceeding `lua-time-limit` | The script cannot be interrupted; only `SCRIPT KILL` can be used (when no data has been written) |

For deleting large keys, use `UNLINK` instead (reclaimed by a background thread); for traversal, use `SCAN` instead (cursor-based, returning only a small amount each time). Eviction when `used_memory > maxmemory` is also performed on the main thread, and the number of samples is controlled by `maxmemory-samples`.

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

### 2.1 Encoding and Thresholds for Small Collections

| Type | Small-Collection Encoding | Threshold Parameter |
|---|---|---|
| string | `int` / `embstr` | `embstr` is used within 44 bytes |
| hash | `listpack` | `hash-max-listpack-entries` |
| list | `quicklist` (nodes are listpacks) | `list-max-listpack-size` |
| set | `intset` (all integers) | `set-max-intset-entries` |
| zset | `listpack` | `zset-max-listpack-entries` |

When the threshold is exceeded or an element length exceeds the limit (`*-max-listpack-value`, default 64), it is converted to a regular structure such as `hashtable` / `skiplist`. **The conversion is one-way**, and it will not convert back even if deletions bring it below the threshold. This is also why "after hundreds of thousands of fields are written into a hash, memory usage multiplies".

### 2.2 listpack and the Retired ziplist

Starting with Redis 7.0, the small-collection encoding for hash and zset changed to `listpack`; starting with 7.2, the quicklist nodes of list were also unified as listpack; `ziplist` remains only in the legacy RDB-compatible read path. `listpack` removes the `zltail` field and the `prevlen` chained length of `ziplist`, so there is no cascading update problem.

The `listpack` layout:

```
<total-bytes><num-elements><entry>...<entry><0xFF>
```

Each entry consists of "encoding byte + data + variable-length backlen"; `backlen` records its own length and is used for backward traversal, replacing the `prevlen` in ziplist that caused cascading updates.

Its memory-saving principle: integers are encoded according to their actual size (7-bit, 13-bit, 16/24/32/64-bit), strings have pointers and struct headers removed, and elements are stored contiguously without fragmentation. The cost is that insertion and deletion require O(N) memory moves, so it is only used for small collections.

## 3. Strings: SDS

Redis does not use C strings directly. Since 3.2, they are divided by length into five headers, `sdshdr5/8/16/32/64`, and the smallest one is chosen as needed:

```c
struct __attribute__ ((__packed__)) sdshdr8 {
    uint8_t len;        /* 已用长度 */
    uint8_t alloc;      /* 已分配容量，不含头和结尾 \0 */
    unsigned char flags;/* 低 3 位标识头类型 */
    char buf[];
};
```

This brings four properties:

1. `len` is directly available, so `STRLEN` is O(1), and there is no need to scan to `\0` as in C.
2. `alloc` is checked before appending, and capacity is expanded if insufficient, so there is no out-of-bounds access.
3. Expansion uses preallocation (doubling when less than 1 MB, and leaving an extra 1 MB when greater than 1 MB); together with `alloc` recording capacity, the number of `realloc` calls for consecutive `APPEND` operations is greatly reduced.
4. Length is determined by `len` rather than `\0`, so arbitrary binary data can be stored, including `\0`.

`embstr` allocates `robj` and `sdshdr8` together in one contiguous block of memory and is used when the length is ≤44 bytes, saving one `malloc`; beyond that, `raw` is used, with `ptr` pointing separately to the SDS.

## 4. Persistence

| Method | Trigger | Loss Window |
|---|---|---|
| RDB | `save` rules / `BGSAVE` | Between two snapshots |
| AOF (`everysec`) | Flush to disk every second | About 1 second |
| RDB + AOF hybrid | AOF rewrite starts with RDB | About 1 second |

### 4.1 RDB and the Cost of fork

`BGSAVE` uses `fork` to create a child process to write the snapshot while the parent process continues serving, sharing memory pages via COW (copy-on-write). The more frequent the writes, the more pages need to be copied, and the memory peak may approach twice the usage, so leave headroom for fork when configuring `maxmemory`.

`SAVE` is synchronous and blocks the entire instance until writing is complete; in production, use only `BGSAVE`.

### 4.2 AOF's Multi-File Format

Before 7.0, AOF was a single file, and `aof-rewrite-incremental-fsync` was used during rewrite to mitigate disk jitter. Starting with 7.0, it changed to three parts under the `appenddirname` directory:

- `*.base.rdb`: the base snapshot generated by rewrite (RDB format)
- `*.incr.aof`: incremental commands
- `*.manifest`: records which files are currently in use

The benefit is that rewriting no longer requires renaming large files, and there is no longer the problem of "a failed rewrite making AOF unavailable". Among the three values of `appendfsync`, `always` fsyncs on every command (throughput drops by an order of magnitude), `everysec` is the default and recommended compromise, and `no` leaves the flush timing to the kernel.

## 5. High Availability

### 5.1 Master-Replica Replication

After a replica executes `REPLICAOF host port`, it goes through three steps: establish a connection and `PING` → authenticate and send `REPLCONF` to obtain `runid` and `offset` → `PSYNC`.

- If `runid` matches and the offset is still within the master's `repl-backlog` (a circular buffer whose size is `repl-backlog-size`), perform **partial resynchronization**, resending only the missing commands.
- Otherwise, perform **full resynchronization**: the master runs `BGSAVE` to generate and transfer an RDB file; new writes during this period are buffered in the client buffer and sent after the RDB transfer completes.

Replication is **asynchronous**: the master returns to the client after executing a command and does not wait for replica acknowledgment. If network jitter occurs or the replica falls behind by more than `repl-backlog-size`, it degrades to full resynchronization. This is a common cause of "replication lag suddenly increasing and network traffic saturating"; increasing `repl-backlog-size` can mitigate it.

### 5.2 Sentinel

Sentinel itself is an independent process, usually deployed as 3 or 5 instances, monitoring masters and replicas, performing failovers, and providing clients with the new master address.

The decision has two layers: a single Sentinel marks **subjectively down** (SDOWN) if it cannot ping the node within `down-after-milliseconds`; only when `quorum` Sentinels agree is it marked **objectively down** (ODOWN) and an election triggered.

Two points that are easy to misconfigure:

- `quorum` only determines "when to mark down"; **actually performing failover requires a majority of Sentinels to elect a leader** (N/2+1). So with 3 Sentinels and `quorum` set to 2, if 2 go down, failover still cannot occur.
- After failover, when the old master recovers it is demoted to a replica. However, if the client has cached the address, it needs to be updated via Sentinel awareness or the client library's subscription mechanism; otherwise it will keep writing to the old master.

### 5.3 Cluster

Cluster shards by slot: 16384 slots are evenly distributed among the master nodes, and each master has several replicas. The number of slots is fixed at 16384 rather than a larger value because nodes exchange slot bitmaps via gossip, and the bitmap size directly affects heartbeat packet size.

```c
unsigned int keyHashSlot(char *key, int keylen) {
    return crc16(key, keylen) & 16383;
}
```

Note that it is **CRC16 followed by bitwise AND with 16383**, not "hash the key and then take the modulo". The bitwise AND requires the number of slots to be a power of 2, which is also why 16384 was chosen.

**hash tag**: If a key contains `{...}`, only the part inside the braces is used for CRC16; `{user:1}:name` and `{user:1}:age` map to the same slot. Multi-key commands (`MGET`, `SUNION`, Lua, transactions) must rely on this to ensure the same slot; otherwise they report `CROSSSLOT Keys in request don't hash to the same slot`.

Complete failover conditions:

1. The replica loses contact with its master for longer than `cluster-node-timeout`, and the master is marked `FAIL` by a majority of slot-owning masters.
2. The replica checks whether its own data is too stale (`cluster-replica-validity-factor`); if too stale, it does not run for election.
3. It solicits votes from slot-owning masters; upon receiving more than half, it is promoted and takes over the original master's slots.
4. The remaining replicas switch to replicating the new master.

If only one master is down but the cluster as a whole loses a majority of masters (for example, 2 of 3 masters in a 3-master/3-replica cluster are down), the cluster stops serving and reports `CLUSTERDOWN`. This is the behavior of `cluster-require-full-coverage yes` (the default).

### 5.4 Consistency Boundaries

Redis replication is asynchronous, so writes that have not yet been synchronized at the moment of failure on the master will be lost. `WAIT` can make the client block until a specified number of replicas acknowledge:

```redis
SET key value
WAIT 1 0
```

It returns the actual number of replicas that acknowledged; `0` means no timeout. However, it only guarantees "reached N replicas", not persistence to disk; and if one of these replicas is promoted to master, writes on the remaining replicas may still be rolled back (`min-replicas-to-write` only rejects writes and does not change replication semantics). In scenarios requiring strong consistency, the source of truth should reside in storage that supports consensus.

## 6. Common Issues Reference

| Symptom | Common Cause |
|---|---|
| Occasional timeouts, entries in `SLOWLOG` | `DEL`/`HGETALL` on a large key, or a full scan by `KEYS` |
| Memory keeps rising, `MEMORY USAGE` spikes | A small collection's encoding is converted to hashtable, or a large element is placed in a listpack |
| Replication lag suddenly increases, traffic doubles | Full resynchronization; `repl-backlog-size` is too small or the replica is blocked |
| Sentinel does not fail over | Too few Sentinels to form a majority, or `quorum` is misconfigured relative to the number of instances |
| `CROSSSLOT` / `MOVED` loop | A multi-key command did not use a hash tag; the client does not handle redirection |
| `OOM command not allowed` | `maxmemory` is exhausted and `maxmemory-policy` is `noeviction` |

## References

- [Redis official documentation](https://redis.io/docs/latest/)
- [Redis persistence (RDB / AOF)](https://redis.io/docs/latest/operate/oss_and_stack/management/persistence/)
- [Redis Cluster specification](https://redis.io/docs/latest/operate/oss_and_stack/reference/cluster-spec/)
- [Sentinel high availability documentation](https://redis.io/docs/latest/operate/oss_and_stack/management/sentinel/)