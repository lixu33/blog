---
isTimeLine: true
sticky: 3
title: Kafka Storage and Replication
description: Kafka partition log structure, replica synchronization and ISR election, producer-side partitioning and idempotence, and consumer group rebalance mechanism. Includes configuration changes after ZooKeeper removal in 4.0, and the correct pairing of acks and min.insync.replicas.
date: 2024-05-20
updated: 2026-10-31
tags:
- Kafka
- Distributed Systems
- Stream processing
categories:
- 后端技术
- Backend
head:
- - meta
  - name: keywords
    content: Kafka,Partition Replicas,ISR,KRaft,acks,min.insync.replicas,Consumer group rebalance,Idempotent producer
translatedFrom: 79acecfa6a801633
---
# Kafka Storage and Replication Mechanisms

This article covers Kafka's storage structure and replica synchronization, focusing on several interdependent parameters: `acks`, `min.insync.replicas`, and `max.poll.interval.ms`. It first explains the mechanisms, then how to combine these parameters.

## Three Things to Remember First

1. **Ordering holds only within a partition**—if you need global ordering, you must use a single partition, at the cost of no parallelism
2. **Reliability = `acks=all` + `min.insync.replicas>=2` + `replication.factor>=3`**; if any one is missing, it is not truly reliable
3. **The number of partitions can only be increased, not decreased**, so the initial value must be calculated correctly the first time

## 1. Core Concepts

| Concept | Purpose |
|---|---|
| Topic | Logical category of messages |
| Partition | Physical shard of a Topic; the smallest unit of an ordered log |
| Broker | Kafka service node; at any given time, only one leader replica of a partition serves from it |
| Replica | Replica, distributed across different brokers |
| Consumer Group | Consumer group; within the group, each partition is consumed by only one consumer |

### About ZooKeeper

Kafka 2.8 introduced KRaft (replacing ZooKeeper with internal Raft consensus), which became production-ready in 3.3, and **4.0 has completely removed ZooKeeper support**. New clusters should use KRaft directly:

```properties
process.roles=broker,controller
node.id=1
controller.quorum.voters=1@host1:9093,2@host2:9093,3@host3:9093
```

`zookeeper.connect` in old tutorials is meaningless in 4.x.

## 2. Storage: A Partition Is an Append-Only Log

On disk, each partition consists of several **log segments** (`00000000000000000000.log` + `.index` + `.timeindex`):

- Writes are always appended to the end of the current active segment, which makes sequential disk writes possible (sequential write throughput is much higher than random writes)
- When a segment is full (`segment.bytes`, default 1GB), a new segment is rolled over
- `.index` is a sparse index from offset → physical position; `.timeindex` is an index from timestamp → offset; together they let lookups by offset or time avoid a full scan

**There are no real `LogSegment`/`ReplicaManager` Java classes for you to call**—these are Kafka internal implementations; they exist in the source code but are not used as APIs. Many "source code analysis" posts online show `public class LogSegment { ... }` as an illustration; copying it verbatim will not compile.

Cleanup policies:

| Policy | Configuration | Behavior |
|---|---|---|
| delete | `cleanup.policy=delete` | Delete old segments according to `retention.ms` / `retention.bytes` |
| compact | `cleanup.policy=compact` | Keep only the latest value for each key; suitable for "state snapshot" topics (such as `__consumer_offsets`) |

## 3. Producer Side

### 3.1 Partition Selection

After Kafka 2.4, the default partitioner is the **Sticky Partitioner** (consolidated into `BuiltInPartitioner` since 3.3): messages without a key fill one batch first before switching partitions, rather than round-robin per message. Round-robin makes batches smaller and increases the number of requests.

- With a key → `murmur2(key) % number of partitions`; the same key always lands in the same partition (the source of ordering)
- Without a key → sticky partitioning, **no ordering guarantee**
- Explicit partition specified → use it directly

The `DefaultPartitioner` class in older versions is deprecated. A custom partitioner only needs to implement the `Partitioner` interface, but in most cases it is unnecessary.

### 3.2 Reliability and Idempotence

```properties
# 生产端
acks=all
enable.idempotence=true
max.in.flight.requests.per.connection=5
retries=2147483647
```

After `enable.idempotence=true`, Kafka assigns each producer a PID and uses sequence numbers for deduplication, so retries do not produce duplicate messages—this is the key to turning "at least once" into "exactly once (on the write side)" and does not affect throughput.

Values and meanings of `acks`:

| Value | Meaning | Risk |
|---|---|---|
| `0` | Considered successful as soon as sent | Message loss goes unnoticed |
| `1` | Returns once the leader has written | Message loss if the leader crashes before synchronization |
| `all` (`-1`) | Returns only after all ISR members have written | Must be used with `min.insync.replicas` |

**Key combination**: With `acks=all` but `min.insync.replicas=1`, a write is considered successful even when only the leader remains in the ISR, which is equivalent to `acks=1`. The correct combination is `replication.factor=3` + `min.insync.replicas=2` + `acks=all`; in this case, one broker failure can be tolerated without data loss.

### 3.3 Batching Configuration

```properties
batch.size=32768        # 单批次字节上限，太小则频繁发请求
linger.ms=5             # 最多等 5ms 凑批，用少量延迟换吞吐
compression.type=lz4    # lz4 在多数场景是吞吐/CPU 的平衡点
buffer.memory=67108864
```

With `linger.ms=0` (the default), in high-throughput scenarios batches will almost always contain only one message, making `batch.size` effectively useless.

## 4. Replicas and Election

- Each partition has 1 leader + N followers; reads and writes go through the leader, and followers actively fetch
- **ISR** (In-Sync Replicas): the set of replicas synchronized with the leader (including the leader). A replica that lags by more than `replica.lag.time.max.ms` (default 30s) is removed
- When the leader fails, the Controller selects a new leader from the ISR

`unclean.leader.election.enable` (default `false`): allows a non-ISR replica to become leader, prioritizing availability but **possibly losing data**. Keeping it disabled by default is correct unless you explicitly accept data loss in exchange for availability.

### 4.1 How to Determine the Number of Partitions

```bash
# 只能增加
kafka-topics.sh --bootstrap-server localhost:9092 \
  --alter --topic my-topic --partitions 12
```

Estimation order:

1. Target throughput (MB/s) ÷ measured throughput per partition (typically 10-50 MB/s) → lower bound on the number of partitions
2. Maximum consumer parallelism = number of partitions; the number of partitions must not be less than the expected number of consumers
3. More partitions are not always better: each partition occupies file handles and memory on the broker, and thousands of partitions significantly slow down controller failover recovery

## 5. Consumer Side

### 5.1 Offsets and Commits

- Offsets are stored in the internal topic `__consumer_offsets`
- With automatic commit `enable.auto.commit=true`, commits are batched according to `auto.commit.interval.ms`, **which may cause duplicate consumption** (crash before commit; after restart, replay from the last committed point)
- When precise control is needed, disable automatic commit and manually call `commitSync()` after business logic is processed, or use `commitAsync()` in batch processing with a fallback `commitSync()`

### 5.2 Rebalance

Changes in the number of consumers, changes in the number of partitions, and consumer disconnection (exceeding `session.timeout.ms`) all trigger a rebalance; during this period, the entire consumer group pauses consumption (stop-the-world).

Mitigation options:

| Configuration | Effect |
|---|---|
| `partition.assignment.strategy=CooperativeStickyAssignor` | Incremental rebalance; only migrates necessary partitions without pausing everyone |
| `max.poll.interval.ms` | Maximum interval between two polls; exceeding it treats the consumer as disconnected—for slow processing tasks, increase it or reduce `max.poll.records` |
| `session.timeout.ms` | Heartbeat timeout, proportional to `heartbeat.interval.ms` (typically 3:1) |

Repeated rebalances after consuming for a while are almost always caused by `max.poll.interval.ms` being too small or single-batch processing being too slow.

### 5.3 What to Do When Consumption Is Slow

```properties
max.poll.records=500
fetch.min.bytes=1
```

- First reduce `max.poll.records` to ensure single processing duration < `max.poll.interval.ms`
- If the real bottleneck is business processing, add consumers rather than threads (the partition count limit is the parallelism limit)

## 6. Performance Sources

| Mechanism | Description |
|---|---|
| Sequential writes | Append-only log avoids disk seeks |
| Zero-copy | `sendfile` sends page cache directly to the NIC, eliminating user-space copies |
| Batching + compression | One request carries a batch; compression reduces both network and disk usage |
| Partition parallelism | Multiple partitions spread across different brokers |
| Page cache | Reads and writes preferentially hit the OS page cache, minimizing JVM heap usage |

Note that the benefit of "zero-copy" depends on consumers keeping up with the production rate; when consumers lag too far, reads come from disk—the sequential-write advantage remains, but latency rises.

## 7. Common Failure Reference

| Symptom | Common Cause |
|---|---|
| Producer `TimeoutException` | `acks=all` but insufficient ISR (broker down or `min.insync.replicas` too high) |
| Consumer lag keeps growing | Consumer count < partition count, or per-record processing is too slow and triggers rebalance |
| Repeated rebalances | `max.poll.interval.ms` too small / processing logic blocks |
| Disk full | `retention.bytes` not set, or `cleanup.policy=compact` but keys grow unbounded |
| Out-of-order messages | No key leads to sticky partitioning, or producer `max.in.flight` > 1 with idempotence disabled |

## References

- [Kafka official documentation: Design and Implementation](https://kafka.apache.org/documentation/#design)
- [KIP-500: Replace ZooKeeper with a Self-Managed Metadata Quorum](https://cwiki.apache.org/confluence/display/KAFKA/KIP-500)
- [KIP-429: Kafka Consumer Incremental Rebalance Protocol](https://cwiki.apache.org/confluence/display/KAFKA/KIP-429)
- [Kafka producer configuration](https://kafka.apache.org/documentation/#producerconfigs)