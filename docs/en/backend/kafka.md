---
isTimeLine: true
sticky: 3
title: Kafka Storage and Replication Mechanism
description: Kafka partition log structure, replica synchronization and ISR election, producer partitioning and idempotence, consumer group rebalance mechanism. Includes configuration changes after ZooKeeper removal in 4.0, and correct pairing of acks and min.insync.replicas.
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
    content: Kafka,Partition Replicas,ISR,KRaft,acks,min.insync.replicas,Consumer group rebalance,Idempotent producer
translatedFrom: 0d0c20bc3b6f2ff0
---
This article covers Kafka's storage structure and replica synchronization, focusing on several interdependent parameters: `acks`, `min.insync.replicas`, and `max.poll.interval.ms`. First it explains the mechanisms, then how these parameters work together.

## Three Things to Remember First

1. **Ordering holds only within a partition**—if global ordering is required, you must use a single partition, at the cost of no parallelism
2. **Reliability = `acks=all` + `min.insync.replicas>=2` + `replication.factor>=3`**; if any one is missing, it is not truly reliable
3. **The partition count can only be increased, not decreased**; the initial value must be calculated correctly once

## 1. Core Concepts

| Concept | Purpose |
|---|---|
| Topic | Logical category of messages |
| Partition | Physical shard of a Topic; the smallest unit of an ordered log |
| Broker | Kafka service node; at any given time, only one leader replica of a partition provides service |
| Replica | Copy of a partition, distributed across different brokers |
| Consumer Group | Consumer group; each partition is consumed by only one consumer in the group |

### About ZooKeeper

Kafka 2.8 introduced KRaft (replacing ZooKeeper with internal Raft consensus), production-ready since 3.3, and **ZooKeeper support was completely removed in 4.0**. New clusters should use KRaft directly:

```properties
process.roles=broker,controller
node.id=1
controller.quorum.voters=1@host1:9093,2@host2:9093,3@host3:9093
```

The `zookeeper.connect` in old tutorials is meaningless in 4.x.

## 2. Storage: A Partition Is an Append-Only Log

Each partition on disk consists of several **log segments** (`00000000000000000000.log` + `.index` + `.timeindex`):

- Writes are always appended to the end of the current active segment, which makes sequential disk writes possible (sequential write throughput is much higher than random writes)
- When a segment is full (`segment.bytes`, default 1GB), a new segment is rolled
- `.index` is a sparse index from offset → physical position, and `.timeindex` is an index from timestamp → offset; together they allow lookups by offset or time without a full scan

**There is no real `LogSegment`/`ReplicaManager` Java class for you to call**—these are Kafka internal implementations; they exist in the source code but are not used as APIs. Many online "source code analysis" posts showing `public class LogSegment { ... }` are illustrative; copying them won't compile.

Cleanup policies:

| Policy | Configuration | Behavior |
|---|---|---|
| delete | `cleanup.policy=delete` | Delete old segments according to `retention.ms` / `retention.bytes` |
| compact | `cleanup.policy=compact` | Retain only the latest value per key; suitable for "state snapshot" topics (e.g., `__consumer_offsets`) |

## 3. Producer Side

### 3.1 Partition Selection

Since Kafka 2.4, the default partitioner has been the **Sticky Partitioner** (converged into `BuiltInPartitioner` since 3.3): messages without a key fill one batch before switching partitions, rather than round-robin per message. Round-robin makes batches smaller and increases the number of requests.

- With a key → `murmur2(key) % partition count`; the same key always lands on the same partition (the source of ordering)
- Without a key → sticky partitioner, **ordering is not guaranteed**
- Explicit partition → used directly

The old `DefaultPartitioner` class is deprecated. A custom partitioner only needs to implement the `Partitioner` interface, but this is unnecessary in most scenarios.

### 3.2 Reliability and Idempotence

```properties
# 生产端
acks=all
enable.idempotence=true
max.in.flight.requests.per.connection=5
retries=2147483647
```

With `enable.idempotence=true`, Kafka assigns each producer a PID and uses sequence numbers for deduplication; retries will not produce duplicate messages—this is the key to turning at-least-once into exactly-once (on the write side), and it does not affect throughput.

Values and meanings of `acks`:

| Value | Meaning | Risk |
|---|---|---|
| `0` | Considered successful once sent | Messages lost without awareness |
| `1` | Returns after the leader writes | Messages lost if the leader crashes before synchronization |
| `all` (`-1`) | Returns only after all ISR replicas write | Must be used with `min.insync.replicas` |

**Key combination**: with `acks=all` but `min.insync.replicas=1`, it still counts as successful when only the leader remains in the ISR, which is equivalent to `acks=1`. The correct combination is `replication.factor=3` + `min.insync.replicas=2` + `acks=all`; in this case, one broker failure can be tolerated without data loss.

### 3.3 Batching Configuration

```properties
batch.size=32768        # 单批次字节上限，太小则频繁发请求
linger.ms=5             # 最多等 5ms 凑批，用少量延迟换吞吐
compression.type=lz4    # lz4 在多数场景是吞吐/CPU 的平衡点
buffer.memory=67108864
```

`linger.ms=0` (default) in high-throughput scenarios makes batches almost always contain only one message, making `batch.size` effectively useless.

## 4. Replicas and Election

- Each partition has 1 leader + N followers; reads and writes go through the leader, and followers actively fetch
- **ISR** (In-Sync Replicas): the set of replicas in sync with the leader (including the leader). If a replica lags beyond `replica.lag.time.max.ms` (default 30s), it is removed
- When the leader fails, the Controller selects a new leader from the ISR

`unclean.leader.election.enable` (default `false`): allows a non-ISR replica to become leader, prioritizing availability but **possibly losing data**. Keeping it off by default is correct unless you explicitly accept data loss in exchange for availability.

### 4.1 How to Determine the Number of Partitions

```bash
# 只能增加
kafka-topics.sh --bootstrap-server localhost:9092 \
  --alter --topic my-topic --partitions 12
```

Estimation order:

1. Target throughput (MB/s) ÷ measured throughput per partition (typically 10-50 MB/s) → lower bound for the partition count
2. Maximum consumer parallelism = partition count; the partition count must not be less than the expected number of consumers
3. More partitions is not always better: each partition occupies file handles and memory on the broker, and thousands of partitions significantly slow down controller failover

## 5. Consumer Side

### 5.1 Offsets and Commits

- Offsets are stored in the internal topic `__consumer_offsets`
- With auto-commit `enable.auto.commit=true`, offsets are committed in batches according to `auto.commit.interval.ms`, **which may cause duplicate consumption** (crash before commit, replay from the last committed offset after restart)
- When precise control is needed, disable auto-commit and manually call `commitSync()` after business logic is processed, or use `commitAsync()` in batch processing with a fallback `commitSync()`

### 5.2 Rebalance

Changes in consumer count, changes in partition count, and consumers going offline (exceeding `session.timeout.ms`) all trigger a rebalance; during this period, the entire consumer group pauses consumption (stop-the-world).

Mitigation:

| Configuration | Effect |
|---|---|
| `partition.assignment.strategy=CooperativeStickyAssignor` | Incremental rebalance; migrates only necessary partitions and does not pause the whole group |
| `max.poll.interval.ms` | Maximum interval between two polls; timeout means the consumer is considered offline—increase it for slow tasks, or reduce `max.poll.records` |
| `session.timeout.ms` | Heartbeat timeout, proportional to `heartbeat.interval.ms` (usually 3:1) |

"Repeated rebalances after consuming for a while" are almost always caused by `max.poll.interval.ms` being too small or a single batch taking too long to process.

### 5.3 What to Do When Consumption Is Slow

```properties
max.poll.records=500
fetch.min.bytes=1
```

- First reduce `max.poll.records` to ensure single processing duration < `max.poll.interval.ms`
- When the real bottleneck is business processing, add consumers rather than threads (the partition count is the upper bound on parallelism)

## 6. Performance Sources

| Mechanism | Description |
|---|---|
| Sequential writes | Append-only log avoids disk seeks |
| Zero-copy | `sendfile` sends the page cache directly to the NIC, eliminating user-space copies |
| Batching + compression | A single request carries a batch; compression saves on both network and disk |
| Partition parallelism | Multiple partitions are spread across different brokers |
| Page cache | Reads and writes hit the OS page cache first, avoiding the JVM heap where possible |

Note that the benefit of "zero-copy" depends on consumers keeping up with production speed; when consumers fall too far behind, reads come from disk. The sequential-write advantage remains, but latency increases.

## 7. Common Failure Reference

| Symptom | Common cause |
|---|---|
| Producer-side `TimeoutException` | `acks=all` but insufficient ISR (broker down or `min.insync.replicas` too high) |
| Consuming lag keeps growing | Number of consumers < number of partitions, or slow per-message processing triggers rebalance |
| Repeated rebalances | `max.poll.interval.ms` too small / processing logic blocks |
| Disk full | `retention.bytes` not set, or `cleanup.policy=compact` but keys grow without bound |
| Out-of-order messages | No key leads to sticky partitioning, or producer `max.in.flight` > 1 with idempotence disabled |

## References

- [Kafka official documentation: Design and Implementation](https://kafka.apache.org/documentation/#design)
- [KIP-500: Replace ZooKeeper with a Self-Managed Metadata Quorum](https://cwiki.apache.org/confluence/display/KAFKA/KIP-500)
- [KIP-429: Kafka Consumer Incremental Rebalance Protocol](https://cwiki.apache.org/confluence/display/KAFKA/KIP-429)
- [Kafka producer configuration](https://kafka.apache.org/documentation/#producerconfigs)