---
isTimeLine: true
sticky: 3
title: Kafka Storage and Replication Mechanism
description: Kafka partition log structure, replica synchronization and ISR election, producer partitioning and idempotence, and consumer group rebalance mechanism. Includes configuration changes after ZooKeeper removal in 4.0, plus the correct pairing of acks and min.insync.replicas.
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
    content: Kafka,Partition replicas,ISR,KRaft,acks,min.insync.replicas,Consumer group rebalance,Idempotent producer
translatedFrom: 838b2f712e11ec59
---
## Three Things to Remember First

1. **Ordering holds only within a partition** — if you need global ordering, you must use a single partition, at the cost of no parallelism
2. **Reliability = `acks=all` + `min.insync.replicas>=2` + `replication.factor>=3`**; if any one of the three is missing, it is not truly reliable
3. **The number of partitions can only be increased, not decreased**, so get the initial value right in one go

## 1. Core Concepts

| Concept | Purpose |
|---|---|
| Topic | Logical categorization of messages |
| Partition | Physical shard of a Topic, the smallest unit of an ordered log |
| Broker | Kafka service node; at any given time, only one leader replica of a partition serves requests on it |
| Replica | Replica, distributed across different brokers |
| Consumer Group | Consumer group; within the group, each partition is consumed by only one consumer |

### About ZooKeeper

Kafka 2.8 introduced KRaft (using internal Raft consensus to replace ZooKeeper), production-ready since 3.3, and **4.0 has completely removed ZooKeeper support**. New clusters should use KRaft directly:

```properties
process.roles=broker,controller
node.id=1
controller.quorum.voters=1@host1:9093,2@host2:9093,3@host3:9093
```

The `zookeeper.connect` from old tutorials is meaningless in 4.x.

## 2. Storage: A Partition Is an Append-Only Log

Each partition on disk consists of several **log segments** (`00000000000000000000.log` + `.index` + `.timeindex`):

- Writes are always appended to the end of the current active segment, which makes sequential disk writes possible (sequential write throughput is far higher than random writes)
- When a segment is full (`segment.bytes`, default 1GB), it rolls to a new segment
- `.index` is a sparse index from offset to physical position, and `.timeindex` is a timestamp-to-offset index; together they let you look up by offset or by time without a full scan

**There are no real `LogSegment`/`ReplicaManager` Java classes for you to call** — these are Kafka internal implementations; they exist in the source code but are not used as APIs. Many "source code analysis" posts online show `public class LogSegment { ... }` as an illustration; copying it verbatim will not compile.

Cleanup policies:

| Policy | Configuration | Behavior |
|---|---|---|
| delete | `cleanup.policy=delete` | Delete old segments according to `retention.ms` / `retention.bytes` |
| compact | `cleanup.policy=compact` | Keep only the latest value for each key, suitable for "state snapshot" topics (such as `__consumer_offsets`) |

## 3. Producer Side

### 3.1 Partition Selection

After Kafka 2.4, the default partitioner is the **Sticky Partitioner** (converged to `BuiltInPartitioner` since 3.3): messages without keys fill one batch first before switching partitions, rather than round-robin per message. Round-robin shrinks batches and increases the number of requests.

- With key → `murmur2(key) % number of partitions`; the same key always lands on the same partition (the source of ordering)
- Without key → sticky partitioner, **ordering is not guaranteed**
- Explicit partition → use it directly

The old `DefaultPartitioner` class has been deprecated. A custom partitioner only needs to implement the `Partitioner` interface, but in most scenarios it is unnecessary.

### 3.2 Reliability and Idempotence

```properties
# 生产端
acks=all
enable.idempotence=true
max.in.flight.requests.per.connection=5
retries=2147483647
```

After `enable.idempotence=true`, Kafka assigns a PID to each producer and uses sequence numbers for deduplication, so retries do not produce duplicate messages — this is the key to turning at-least-once into exactly-once (on the write side), and it does not affect throughput.

Values and meanings of `acks`:

| Value | Meaning | Risk |
|---|---|---|
| `0` | Considered successful as soon as sent | Message loss goes undetected |
| `1` | Returns after leader writes | Message loss if leader crashes before synchronization |
| `all` (`-1`) | Returns only after all ISR replicas have written | Must be paired with `min.insync.replicas` |

**Critical combination**: with `acks=all` but `min.insync.replicas=1`, an ISR containing only the leader also counts as success, which is equivalent to `acks=1`. The correct combination is `replication.factor=3` + `min.insync.replicas=2` + `acks=all`; in this case, one broker failure can be tolerated without data loss.

### 3.3 Batch Configuration

```properties
batch.size=32768        # 单批次字节上限，太小则频繁发请求
linger.ms=5             # 最多等 5ms 凑批，用少量延迟换吞吐
compression.type=lz4    # lz4 在多数场景是吞吐/CPU 的平衡点
buffer.memory=67108864
```

In high-throughput scenarios, `linger.ms=0` (the default) makes batches almost always contain only one message, rendering `batch.size` effectively useless.

## 4. Replicas and Election

- Each partition has 1 leader + N followers; reads and writes all go through the leader, and followers actively fetch
- **ISR** (In-Sync Replicas): the set of replicas that stay in sync with the leader (including the leader). Replicas that fall behind by more than `replica.lag.time.max.ms` (default 30s) are removed
- When the leader fails, the Controller selects a new leader from the ISR

`unclean.leader.election.enable` (default `false`): allows non-ISR replicas to become leader, prioritizing availability but **possibly losing data**. Keeping it off by default is correct unless you explicitly accept data loss in exchange for availability.

### 4.1 How to Determine the Number of Partitions

```bash
# 只能增加
kafka-topics.sh --bootstrap-server localhost:9092 \
  --alter --topic my-topic --partitions 12
```

Estimation order:

1. Target throughput (MB/s) ÷ measured per-partition throughput (typically 10-50 MB/s) → lower bound on partition count
2. Maximum consumer parallelism = number of partitions; the partition count must not be less than the expected number of consumers
3. More partitions is not always better: each partition occupies file handles and memory on the broker, and thousands of partitions significantly slow controller failover recovery

## 5. Consumer Side

### 5.1 Offsets and Commits

- Offsets are stored in the internal topic `__consumer_offsets`
- With auto-commit `enable.auto.commit=true`, commits are batched according to `auto.commit.interval.ms`, **which may cause duplicate consumption** (crash before commit, replay from the last committed point after restart)
- When precise control is needed, disable auto-commit and manually call `commitSync()` after business logic is processed, or use `commitAsync()` + fallback `commitSync()` in batch processing

### 5.2 Rebalance

Changes in the number of consumers, changes in the number of partitions, and consumers going offline (exceeding `session.timeout.ms`) all trigger a rebalance; during this period, the entire consumer group pauses consumption (stop-the-world).

Mitigation measures:

| Configuration | Purpose |
|---|---|
| `partition.assignment.strategy=CooperativeStickyAssignor` | Incremental rebalance, migrating only necessary partitions without pausing all consumers |
| `max.poll.interval.ms` | Maximum interval between two polls; timeout is treated as the consumer going offline — increase it for slow tasks, or reduce `max.poll.records` |
| `session.timeout.ms` | Heartbeat timeout, proportional to `heartbeat.interval.ms` (usually 3:1) |

"Repeated rebalances after consuming for a while" is almost always due to `max.poll.interval.ms` being too small or a single batch being processed too slowly.

### 5.3 What to Do When Consumption Is Slow

```properties
max.poll.records=500
fetch.min.bytes=1
```

- First reduce `max.poll.records` to ensure single-processing time < `max.poll.interval.ms`
- When the real bottleneck is business processing, add consumers rather than threads (the partition count upper bound is the parallelism upper bound)

## 6. Performance Sources

| Mechanism | Description |
|---|---|
| Sequential writes | Append-only log avoids disk seeks |
| Zero-copy | `sendfile` sends page cache directly to the NIC, eliminating user-space copies |
| Batching + compression | One request carries a batch; compression saves on both network and disk |
| Partition parallelism | Multiple partitions are spread across different brokers |
| Page cache | Reads and writes preferentially hit the OS page cache, avoiding the JVM heap as much as possible |

Note that the benefit of "zero-copy" depends on consumers keeping up with production speed; when consumers lag too far behind, reads fall back to disk—the sequential-write advantage remains, but latency rises.

## 7. Common Failure Reference

| Symptom | Common Cause |
|---|---|
| Producer-side `TimeoutException` | `acks=all` but insufficient ISR (broker down or `min.insync.replicas` too high) |
| Consumer lag keeps growing | Number of consumers < number of partitions, or per-message processing is too slow and triggers rebalance |
| Frequent rebalances | `max.poll.interval.ms` too small / processing logic blocks |
| Disk full | `retention.bytes` not set, or `cleanup.policy=compact` but keys grow without bound |
| Message ordering broken | Messages without keys use sticky partitioning, or producer `max.in.flight` > 1 with idempotence disabled |

## References

- [Kafka Official Documentation: Design and Implementation](https://kafka.apache.org/documentation/#design)
- [KIP-500: Replace ZooKeeper with a Self-Managed Metadata Quorum](https://cwiki.apache.org/confluence/display/KAFKA/KIP-500)
- [KIP-429: Kafka Consumer Incremental Rebalance Protocol](https://cwiki.apache.org/confluence/display/KAFKA/KIP-429)
- [Kafka Producer Configs](https://kafka.apache.org/documentation/#producerconfigs)