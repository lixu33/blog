---
isTimeLine: true
sticky: 3
title: Kafka Storage and Replication Mechanism
description: Kafka partition log structure, replica synchronization and ISR election, producer partitioning and idempotence, and consumer group rebalance mechanism. Includes configuration changes after ZooKeeper removal in 4.0, and correct pairing of acks and min.insync.replicas.
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
    content: Kafka,Partition replicas,ISR,KRaft,acks,min.insync.replicas,Consumer group rebalance,Idempotent Producer
translatedFrom: b0e2a8dd07b26f56
---
# Kafka Storage and Replication Mechanisms

This article covers Kafka's storage structure and replica synchronization, focusing on several interdependent parameters: `acks`, `min.insync.replicas`, and `max.poll.interval.ms`. We'll explain the mechanisms first, then how these parameters should be combined.

## Three Things to Remember First

1. **Ordering holds only within a partition**—if you need global ordering, you must use a single partition, at the cost of no parallelism
2. **Reliability = `acks=all` + `min.insync.replicas>=2` + `replication.factor>=3`**; if any one is missing, it is not truly reliable
3. **The number of partitions can only be increased, not decreased**, so calculate the initial value correctly in one go

## I. Core Concepts

| Concept | Purpose |
|---|---|
| Topic | Logical classification of messages |
| Partition | Physical shard of a Topic; the smallest unit of an ordered log |
| Broker | Kafka service node; at any given moment, only one leader replica of a partition provides service there |
| Replica | Replica, distributed across different brokers |
| Consumer Group | Consumer group; within the group, each partition is consumed by only one consumer |

### About ZooKeeper

Kafka 2.8 introduced KRaft (using internal Raft consensus to replace ZooKeeper); it became production-ready in 3.3, and **4.0 has completely removed ZooKeeper support**. New clusters should use KRaft directly:

```properties
process.roles=broker,controller
node.id=1
controller.quorum.voters=1@host1:9093,2@host2:9093,3@host3:9093
```

The `zookeeper.connect` in older tutorials is meaningless in 4.x.

## II. Storage: A Partition Is an Append-Only Log

Each partition on disk consists of several **log segments** (`00000000000000000000.log` + `.index` + `.timeindex`):

- Writes are always appended to the end of the current active segment, which makes sequential disk writes possible (sequential write throughput is much higher than random writes)
- When a segment is full (`segment.bytes`, default 1GB), a new segment is rolled
- `.index` is a sparse index from offset → physical position, and `.timeindex` is an index from timestamp → offset; together they let "lookup by offset or by time" avoid a full scan

**There is no real `LogSegment`/`ReplicaManager` Java class for you to call**—these are Kafka internal implementations; they exist in the source code but are not used as an API. Many online "source code analysis" posts show `public class LogSegment { ... }` as an illustration; copying it won't compile.

Cleanup policies:

| Policy | Configuration | Behavior |
|---|---|---|
| delete | `cleanup.policy=delete` | Deletes old segments according to `retention.ms` / `retention.bytes` |
| compact | `cleanup.policy=compact` | Keeps only the latest value for each key, suitable for "state snapshot" topics (such as `__consumer_offsets`) |

## III. Producer Side

### 3.1 Partition Selection

After Kafka 2.4, the default partitioner is the **sticky partitioner** (Sticky Partitioner; since 3.3 it has been consolidated into `BuiltInPartitioner`): messages without a key first fill one batch and then switch partitions, instead of round-robin per record. Round-robin makes batches smaller and increases the number of requests.

- With key → `murmur2(key) % number of partitions`; the same key always lands on the same partition (the source of ordering)
- Without key → sticky partitioner, **ordering is not guaranteed**
- Explicit partition specified → used directly

The `DefaultPartitioner` class in older versions is deprecated. A custom partitioner only needs to implement the `Partitioner` interface, but in most scenarios this is unnecessary.

### 3.2 Reliability and Idempotence

```properties
# 生产端
acks=all
enable.idempotence=true
max.in.flight.requests.per.connection=5
retries=2147483647
```

After `enable.idempotence=true`, Kafka assigns each producer a PID and uses sequence numbers for deduplication, so retries do not produce duplicate messages—this is the key to turning "at least once" into "exactly once (on the write side)", and it does not affect throughput.

`acks` values and meanings:

| Value | Meaning | Risk |
|---|---|---|
| `0` | Considered successful as soon as sent | Message loss goes unnoticed |
| `1` | Returns as soon as the leader writes | Message loss if the leader crashes before synchronization |
| `all` (`-1`) | Returns only after all ISR members write | Must be used with `min.insync.replicas` |

**Key combination**: with `acks=all` but `min.insync.replicas=1`, success is still considered achieved when only the leader remains in the ISR, which is equivalent to `acks=1`. The correct combination is `replication.factor=3` + `min.insync.replicas=2` + `acks=all`; in this case, one broker failure can be tolerated without data loss.

### 3.3 Batching Configuration

```properties
batch.size=32768        # 单批次字节上限，太小则频繁发请求
linger.ms=5             # 最多等 5ms 凑批，用少量延迟换吞吐
compression.type=lz4    # lz4 在多数场景是吞吐/CPU 的平衡点
buffer.memory=67108864
```

`linger.ms=0` (the default) in high-throughput scenarios makes batches almost always contain only one record, rendering `batch.size` ineffective.

## IV. Replicas and Election

- Each partition has 1 leader + N followers; both reads and writes go through the leader, and followers actively fetch
- **ISR** (In-Sync Replicas): the set of replicas that stay in sync with the leader (including the leader). A replica lagging by more than `replica.lag.time.max.ms` (default 30s) is removed
- When the leader fails, the Controller selects a new leader from the ISR

`unclean.leader.election.enable` (default `false`): allows non-ISR replicas to become leader, prioritizing availability but **possibly losing data**. Disabling it by default is correct unless you explicitly accept data loss in exchange for availability.

### 4.1 How to Determine the Number of Partitions

```bash
# 只能增加
kafka-topics.sh --bootstrap-server localhost:9092 \
  --alter --topic my-topic --partitions 12
```

Estimation order:

1. Target throughput (MB/s) ÷ measured throughput per partition (generally 10-50 MB/s) → lower bound on the number of partitions
2. Maximum consumer parallelism = number of partitions; the number of partitions must not be less than the expected number of consumers
3. More partitions is not always better: each partition occupies file handles and memory on the broker, and thousands of partitions significantly slow down controller failover

## V. Consumer Side

### 5.1 Offsets and Commits

- Offsets are stored in the internal topic `__consumer_offsets`
- With automatic commit `enable.auto.commit=true`, commits are batched according to `auto.commit.interval.ms`, **which may cause duplicate consumption** (crash before commit, then replay from the last committed point after restart)
- When precise control is needed, disable auto-commit and manually call `commitSync()` after business logic is processed, or use `commitAsync()` + a fallback `commitSync()` in batch processing

### 5.2 Rebalance

Changes in the number of consumers, changes in the number of partitions, and consumer disconnection (exceeding `session.timeout.ms`) all trigger rebalance, during which the entire consumer group pauses consumption (stop-the-world).

Mitigation methods:

| Configuration | Purpose |
|---|---|
| `partition.assignment.strategy=CooperativeStickyAssignor` | Incremental rebalance; only necessary partitions are migrated, without pausing everyone |
| `max.poll.interval.ms` | Maximum interval between two polls; timeout is treated as consumer disconnection—increase it for slow-processing tasks, or reduce `max.poll.records` |
| `session.timeout.ms` | Heartbeat timeout; proportional to `heartbeat.interval.ms` (generally 3:1) |

"Repeated rebalance after consuming for a while" is almost always due to `max.poll.interval.ms` being too small or a single batch being processed too slowly.

### 5.3 What to Do If Consumption Is Slow

```properties
max.poll.records=500
fetch.min.bytes=1
```

- First reduce `max.poll.records` to ensure a single processing duration < `max.poll.interval.ms`
- When the real bottleneck is business processing, add consumers rather than threads (the upper limit on partitions is the upper limit on parallelism)

## 6. Sources of Performance

| Mechanism | Description |
|---|---|
| Sequential writes | Append to the log, avoiding disk seeks |
| Zero-copy | `sendfile` sends page cache directly to the NIC, eliminating user-space copies |
| Batching + compression | One request carries a batch, and compression saves on both the network and disk sides |
| Partition parallelism | Multiple partitions are distributed across different brokers |
| Page cache | Both reads and writes preferentially hit the OS page cache, minimizing use of the JVM heap |

Note that the benefit of "zero-copy" depends on consumers keeping up with the production rate; when consumers fall too far behind, reads come from disk. The sequential-write advantage remains, but latency increases.

## 7. Common Failure Reference

| Symptom | Common Cause |
|---|---|
| `TimeoutException` on the producer side | `acks=all` but insufficient ISR (broker down or `min.insync.replicas` too high) |
| Consumer lag keeps growing | Number of consumers < number of partitions, or single-message processing is too slow and triggers rebalance |
| Repeated rebalances | `max.poll.interval.ms` too small / processing logic blocked |
| Disk full | `retention.bytes` not set, or `cleanup.policy=compact` but keys grow without bound |
| Message ordering broken | No key causes sticky partitioning, or producer `max.in.flight` > 1 with idempotence disabled |

## Related Reading

- [Redis Principles and High Availability Solutions](/en/backend/redis): Division of responsibilities between caching and message queues
- [Spring Boot Auto-configuration and Startup Process](/en/backend/springBoot): Consumer configuration on the Spring side
- [Netty's Event Loop, Pipeline, and Zero-Copy](/en/backend/netty): Custom network protocols in high-throughput scenarios

## References

- [Kafka Official Documentation: Design and Implementation](https://kafka.apache.org/documentation/#design)
- [KIP-500: Replace ZooKeeper with a Self-Managed Metadata Quorum](https://cwiki.apache.org/confluence/display/KAFKA/KIP-500)
- [KIP-429: Kafka Consumer Incremental Rebalance Protocol](https://cwiki.apache.org/confluence/display/KAFKA/KIP-429)
- [Kafka Producer Configurations](https://kafka.apache.org/documentation/#producerconfigs)