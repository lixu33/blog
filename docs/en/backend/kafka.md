---
isTimeLine: true
sticky: 3
title: Kafka Storage and Replication Mechanism
description: Kafka partition log structure, replica synchronization and ISR election, producer partitioning and idempotence, and consumer group rebalance mechanisms. Includes configuration changes after ZooKeeper removal in 4.0, plus the correct pairing of acks and min.insync.replicas.
date: 2024-05-20
updated: 2026-10-31
tags:
- Kafka
- Distributed Systems
- Stream processing
categories:
- Backend Technology
- Backend
head:
- - meta
  - name: keywords
    content: Kafka,partition replica,ISR,KRaft,acks,min.insync.replicas,Consumer group rebalance,Idempotent Producer
translatedFrom: 6646d40dd93453f8
---
There is no shortage of Kafka documentation or source-code analyses; what actually causes production incidents is often the combination of a few configurations: `acks` is set to `all` but nobody looks after `min.insync.replicas`, or processing a single batch a little slowly leads to repeated rebalances.

This article starts with storage and replication mechanisms, then explains why these configurations must be set the way they are.

## Three Things to Remember First

1. **Ordering only holds within a partition**—global ordering requires a single partition, at the cost of no parallelism
2. **Reliability = `acks=all` + `min.insync.replicas>=2` + `replication.factor>=3`**; if any one is missing, it is not truly reliable
3. **The partition count can only increase, not decrease**; the initial value must be calculated correctly once

## 1. Core Concepts

| Concept | Purpose |
|---|---|
| Topic | Logical category of messages |
| Partition | Physical shard of a Topic, the smallest unit of an ordered log |
| Broker | Kafka service node; at any given moment, a partition has only one leader replica providing service |
| Replica | Replica distributed across different brokers |
| Consumer Group | Consumer group; within the group, each partition is consumed by only one consumer |

### About ZooKeeper

Kafka 2.8 introduced KRaft (replacing ZooKeeper with internal Raft consensus), it has been production-ready since 3.3, and **4.0 has completely removed ZooKeeper support**. New clusters should use KRaft directly:

```properties
process.roles=broker,controller
node.id=1
controller.quorum.voters=1@host1:9093,2@host2:9093,3@host3:9093
```

The `zookeeper.connect` from old tutorials is meaningless in 4.x.

## 2. Storage: A Partition Is an Append-Only Log

On disk, each partition consists of several **log segments** (`00000000000000000000.log` + `.index` + `.timeindex`):

- Writes are always appended to the end of the current active segment, which makes sequential disk writes possible (sequential write throughput is far higher than random writes)
- When a segment is full (`segment.bytes`, default 1GB), a new segment is rolled
- `.index` is a sparse index from offset to physical position, and `.timeindex` is an index from timestamp to offset; together they allow "lookup by offset or by time" without a full scan

**There are no real `LogSegment`/`ReplicaManager` Java classes for you to call**—these are Kafka internal implementations; they exist in the source code but are not used as APIs. Many "source-code analysis" posts online show `public class LogSegment { ... }` as an illustration; copying it will not compile.

Cleanup strategies:

| Strategy | Configuration | Behavior |
|---|---|---|
| delete | `cleanup.policy=delete` | Deletes old segments according to `retention.ms` / `retention.bytes` |
| compact | `cleanup.policy=compact` | Retains only the latest value for each key, suitable for "state snapshot" topics (such as `__consumer_offsets`) |

## 3. Producer Side

### 3.1 Partition Selection

Since Kafka 2.4, the default partitioner has been the **Sticky Partitioner** (converged into `BuiltInPartitioner` since 3.3): messages without a key fill up one batch before switching partitions, rather than round-robin per message. Round-robin makes batches smaller and increases the request count.

- With a key → `murmur2(key) % partition count`; the same key always lands on the same partition (the source of ordering)
- Without a key → sticky partitioner, **ordering is not guaranteed**
- Explicitly specified partition → used directly

The `DefaultPartitioner` class in older versions is deprecated; a custom partitioner only needs to implement the `Partitioner` interface, but this is unnecessary in most scenarios.

### 3.2 Reliability and Idempotence

```properties
# 生产端
acks=all
enable.idempotence=true
max.in.flight.requests.per.connection=5
retries=2147483647
```

After `enable.idempotence=true`, Kafka assigns each producer a PID and deduplicates using sequence numbers, so retries will not produce duplicate messages—this is the key to turning "at least once" into "exactly once (on the write side)", and it does not affect throughput.

Values and meanings of `acks`:

| Value | Meaning | Risk |
|---|---|---|
| `0` | Considered successful as soon as it is sent | Message loss goes undetected |
| `1` | Returns once the leader writes | Message loss if the leader crashes before syncing |
| `all` (`-1`) | Returns only after all ISR members write | Must be used with `min.insync.replicas` |

**Key combination**: with `acks=all` but `min.insync.replicas=1`, success is counted even when only the leader remains in the ISR, which is equivalent to `acks=1`. The correct combination is `replication.factor=3` + `min.insync.replicas=2` + `acks=all`; in this case, one broker failure can be tolerated without data loss.

### 3.3 Batching Configuration

```properties
batch.size=32768        # 单批次字节上限，太小则频繁发请求
linger.ms=5             # 最多等 5ms 凑批，用少量延迟换吞吐
compression.type=lz4    # lz4 在多数场景是吞吐/CPU 的平衡点
buffer.memory=67108864
```

With `linger.ms=0` (the default), in high-throughput scenarios batches will almost always contain only one message, rendering `batch.size` meaningless.

## 4. Replicas and Election

- Each partition has 1 leader + N followers; both reads and writes go through the leader, and followers actively fetch
- **ISR** (In-Sync Replicas): the set of replicas keeping in sync with the leader (including the leader). A replica that lags by more than `replica.lag.time.max.ms` (default 30s) is removed
- When the leader fails, the Controller selects a new leader from the ISR

`unclean.leader.election.enable` (default `false`): allows non-ISR replicas to become leader, prioritizing availability but **possibly losing data**. The default of disabled is correct unless you explicitly accept data loss in exchange for availability.

### 4.1 How to Determine the Partition Count

```bash
# 只能增加
kafka-topics.sh --bootstrap-server localhost:9092 \
  --alter --topic my-topic --partitions 12
```

Estimation order:

1. Target throughput (MB/s) ÷ measured per-partition throughput (generally 10-50 MB/s) → lower bound for the partition count
2. Maximum consumer parallelism = partition count; the partition count cannot be less than the expected number of consumers
3. More partitions is not better: each partition occupies file handles and memory on brokers; thousands of partitions will significantly slow down controller failover recovery

## 5. Consumer Side

### 5.1 Offsets and Commits

- Offsets are stored in the internal topic `__consumer_offsets`
- With auto commit `enable.auto.commit=true`, commits are batched according to `auto.commit.interval.ms`, **which may cause duplicate consumption** (crash before commit, replay from the last committed point after restart)
- When precise control is needed, turn off auto commit and manually call `commitSync()` after processing business logic, or use `commitAsync()` with a fallback `commitSync()` in batch processing

### 5.2 Rebalance

Changes in the number of consumers, changes in the number of partitions, or a consumer going offline (exceeding `session.timeout.ms`) all trigger a rebalance, during which the entire consumer group pauses consumption (stop-the-world).

Mitigation measures:

| Configuration | Purpose |
|---|---|
| `partition.assignment.strategy=CooperativeStickyAssignor` | Incremental rebalance, migrating only the necessary partitions without pausing everyone |
| `max.poll.interval.ms` | Maximum interval between two polls; timeout is treated as the consumer going offline—increase it for slow tasks, or reduce `max.poll.records` |
| `session.timeout.ms` | Heartbeat timeout, proportional to `heartbeat.interval.ms` (generally 3:1) |

"Repeated rebalances after consuming for a while" are almost always caused by `max.poll.interval.ms` being too small or a single batch taking too long to process.

### 5.3 What to Do When Consumption Is Slow

```properties
max.poll.records=500
fetch.min.bytes=1
```

- First reduce `max.poll.records` to ensure the processing time for a single batch < `max.poll.interval.ms`
- If the real bottleneck is business processing, add consumers rather than threads (the partition count upper bound is the parallelism upper bound)

## 6. Sources of Performance

| Mechanism | Description |
|---|---|
| Sequential writes | Append-only log avoids disk seeking |
| Zero-copy | `sendfile` sends page cache directly to the NIC, eliminating user-space copies |
| Batching + compression | One request carries a batch; compression saves on both network and disk |
| Partition parallelism | Multiple partitions are spread across different brokers |
| Page cache | Reads and writes preferentially hit the OS page cache, minimizing use of the JVM heap |

Note that the benefit of zero-copy depends on consumers keeping up with the production rate; when consumers fall too far behind, reads come from disk. The sequential-write advantage remains, but latency increases.

## 7. Common Failure Reference

| Symptom | Common Cause |
|---|---|
| Producer-side `TimeoutException` | `acks=all` but insufficient ISR (broker down or `min.insync.replicas` too high) |
| Consumer lag keeps growing | Fewer consumers than partitions, or single-record processing is too slow and triggers rebalance |
| Repeated rebalances | `max.poll.interval.ms` too small / processing logic blocked |
| Disk full | `retention.bytes` not set, or `cleanup.policy=compact` but keys grow unbounded |
| Message ordering broken | Messages without a key use sticky partitioning, or producer `max.in.flight` > 1 with idempotence disabled |

## References

- [Kafka official documentation: Design and Implementation](https://kafka.apache.org/documentation/#design)
- [KIP-500: Replace ZooKeeper with a Self-Managed Metadata Quorum](https://cwiki.apache.org/confluence/display/KAFKA/KIP-500)
- [KIP-429: Kafka Consumer Incremental Rebalance Protocol](https://cwiki.apache.org/confluence/display/KAFKA/KIP-429)
- [Kafka producer configs](https://kafka.apache.org/documentation/#producerconfigs)