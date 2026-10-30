---
isTimeLine: true
title: In-Depth Analysis of Redis Internals
description: In-depth analysis of Redis core technical features, high-performance principles, and high-availability solutions, covering key mechanisms such as the single-threaded model, I/O multiplexing, persistence, master-slave replication, Sentinel, and Cluster.
date: 2024-10-14
tags:
- Redis
- Cache
- High-performance
categories:
- Backend Technology
- Backend
- Database Technology
head:
- - meta
  - name: keywords
    content: Redis,In-memory database,High Performance,High Availability,SDS,Ziplist,Cluster
translatedFrom: 1f6fa208a980c21f
---
# Deep Dive into Redis Principles: Features, High Performance, and High Availability

As a high-performance key-value in-memory database, Redis is widely used in internet architectures. This article takes a deep dive into Redis's core principles, including its unique technical features, the mechanisms behind its high performance, and the solutions that guarantee high availability.

## 1. Core Technical Features of Redis

Redis has many unique technical features that are the key to what sets it apart from other database systems:

### 1.1 In-Memory Storage

Redis stores all data in memory, which is the foundation for its high-speed reads and writes. Compared with traditional disk-based storage, memory access can be several orders of magnitude faster.

### 1.2 Single-Threaded Model

Redis uses a single-threaded model to handle client requests. This design avoids the complexity and overhead of multi-threaded programming while also eliminating the cost of thread switching.

### 1.3 I/O Multiplexing

Although Redis is single-threaded, it uses I/O multiplexing technology (such as epoll) to handle multiple connections simultaneously, which enables Redis to process concurrent requests efficiently.

### 1.4 Rich Data Structures

Redis supports a variety of data structures such as strings, hashes, lists, sets, and sorted sets. These data structures are all built on top of underlying basic data structures such as simple dynamic strings (SDS), doubly linked lists, and ziplists.

```c
typedef struct redisObject {
    unsigned type:4;
    unsigned encoding:4;
    unsigned lru:LRU_BITS;
    int refcount;
    void *ptr;
} robj;
```

This is the structure definition of a Redis object, where type represents the data type, encoding represents the underlying encoding method, and ptr points to the actual data structure.

### 1.5 Persistence Mechanisms

Redis provides two persistence mechanisms, RDB and AOF, which allow data in memory to be saved to disk to prevent data loss.

## 2. How Redis Achieves High Performance

Redis's ability to achieve such high performance is mainly based on the following aspects:

### 2.1 In-Memory Operations

All operations are performed in memory, avoiding the bottleneck of disk I/O.

### 2.2 Efficient Data Structures

Redis selects the optimal data structure for different scenarios, such as simple dynamic strings (SDS), ziplists, and skiplists.

#### 2.2.1 Simple Dynamic Strings (SDS)

SDS is a string data structure implemented by Redis itself. Compared with native C strings, SDS has more advantages:

```c
struct sdshdr {
    int len;        // 字符串长度
    int free;       // 未使用的字节数
    char buf[];     // 字符数组，用于保存字符串
};
```

Advantages of SDS:
1. Constant-time complexity for getting string length
2. Avoids buffer overflow
3. Reduces the number of memory reallocations when modifying strings
4. Binary safe
5. Compatible with some C string functions

These features make string operations in Redis extremely efficient.

#### 2.2.2 Ziplist

The ziplist is a sequential data structure developed by Redis to save memory. It can contain multiple elements, and each element can be a byte array or an integer.

The structure of a ziplist is as follows:

```
<zlbytes><zltail><zllen><entry><entry>...<entry><zlend>
```

- zlbytes: 4 bytes, indicating the number of bytes occupied by the entire ziplist
- zltail: 4 bytes, indicating how many bytes the tail node of the ziplist is from the start address of the ziplist
- zllen: 2 bytes, indicating the number of nodes contained in the ziplist
- entry: list node
- zlend: 1 byte, a special value 0xFF, used to mark the end of the ziplist

Why the ziplist is efficient:
1. Saves memory: each node uses only the necessary memory space
2. Sequential storage: supports fast sequential traversal
3. Flexible encoding: adopts different encoding methods based on the actual data to save space

### 2.3 Pipeline Mechanism

Redis supports pipelines, allowing clients to send multiple commands at once, which reduces the latency of network round trips.

### 2.4 Event-Driven Model

Redis uses an event-driven model to efficiently handle multiple client connections within a single thread.

```c
int main(int argc, char **argv) {
    ...
    initServer();
    aeMain(server.el);
    aeDeleteEventLoop(server.el);
    return 0;
}
```

This is a simplified version of the Redis main function, in which the aeMain function starts the event loop and handles all I/O events and timer events.

## 3. Redis High Availability Solutions

To ensure Redis's high availability, there are mainly the following solutions:

### 3.1 Master-Slave Replication

Redis supports master-slave replication. Slave nodes can replicate the data of the master node, providing redundant data backups.

```
+-------------+
|   Master    |
+-------------+
       |
       | replication
       |
+-------------+  +-------------+
|   Slave 1   |  |   Slave 2   |
+-------------+  +-------------+
```

### 3.2 Sentinel Mechanism

The Sentinel system is used to monitor and manage Redis master-slave clusters. It can automatically perform failure detection and master-slave failover.

```
         +-------------+
         |  Sentinel 1 |
         +-------------+
               |
     +---------+---------+
     |                   |
+-------------+   +-------------+
|   Master    |   |   Slave     |
+-------------+   +-------------+
     |                   |
     +---------+---------+
               |
         +-------------+
         |  Sentinel 2 |
         +-------------+
```

### 3.3 Cluster Mode

Redis Cluster distributes data across multiple nodes through sharding, with each node storing a portion of the data, thereby supporting larger data volumes and higher concurrency.

#### 3.3.1 Cluster Architecture

A Redis cluster usually consists of multiple nodes, and each node is a Redis instance. The nodes in the cluster are divided into master nodes and slave nodes.

```
       +--------+    +--------+    +--------+
       | Master |    | Master |    | Master |
       |   A    |    |   B    |    |   C    |
       +--------+    +--------+    +--------+
           |             |             |
           |             |             |
       +--------+    +--------+    +--------+
       | Slave  |    | Slave  |    | Slave  |
       |   A    |    |   B    |    |   C    |
       +--------+    +--------+    +--------+
```

#### 3.3.2 Data Sharding

Redis Cluster uses the concept of hash slots to distribute data. The cluster has 16384 hash slots, and each master node is responsible for a portion of the slots.

```c
int keyHashSlot(char *key, int keylen) {
    return crc16(key, keylen) & 16383;
}
```

When a client stores a key-value pair, Redis calculates the hash value of the key, then takes it modulo 16384, and the result is the hash slot where the key should be stored.

#### 3.3.3 Cluster Communication

The nodes in a Redis cluster exchange information through a mechanism called the "gossip protocol." Each node maintains a record of information about the entire cluster, including:

- Which nodes are online
- The range of hash slots each master node is responsible for
- The master node corresponding to each slave node

Nodes detect each other's status and exchange information through periodic ping-pong messages.

#### 3.3.4 Failover

When a master node in the cluster fails, one of its slave nodes is promoted to become the new master node. This process is automatic and requires no manual intervention. The specific steps are as follows:

1. The slave node detects that its master node has gone offline.
2. The slave node begins to apply to become the new master node.
3. The other master nodes in the cluster vote.
4. The slave node with the most votes becomes the new master node.
5. The new master node begins to receive client requests.

#### 3.3.5 Consistency Guarantees

Redis Cluster provides a certain degree of consistency guarantee, but not strong consistency. In some cases (such as network partitions), some recent write operations may be lost.

To improve consistency, Redis provides the WAIT command, which allows clients to wait for write operations to be replicated to a specified number of slave nodes.

```redis
SET key value
WAIT 1 0
```

This command waits for the write operation to be replicated to at least 1 slave node, with a timeout of 0 (never times out).

## Conclusion

Through its unique technical features, efficient implementation mechanisms, and diverse high availability solutions, Redis has become an indispensable component in modern internet architectures. A deep understanding of these Redis principles—especially its high-performance data structures such as SDS and ziplists, as well as its complex cluster mechanisms—is crucial for us to better use and optimize Redis. In practical applications, we need to choose appropriate data structures and high availability solutions according to specific scenarios in order to fully leverage Redis's performance advantages.