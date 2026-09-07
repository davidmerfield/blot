A high-performance, fault-tolerant consensus engine implementing the Raft algorithm with several optimizations for low-latency operations. Built in Rust with a focus on predictable performance and operational simplicity.


## Architecture

Quasar uses a leader-based consensus model with the following key components:

- **State Machine Replication**: All state changes are logged and replicated across the cluster
- **Leader Election**: Fast leader election with randomized timeouts to prevent split votes
- **Log Compaction**: Efficient snapshotting and log compaction to manage storage growth
- **Network Partition Handling**: Automatic detection and recovery from network partitions

## Performance Characteristics

| Operation | P50 Latency | P99 Latency | Throughput |
|-----------|-------------|-------------|------------|
| Write (3 nodes) | 1.2ms | 3.8ms | 45k ops/sec |
| Read (local) | 0.3ms | 0.9ms | 120k ops/sec |
| Leader Election | 150ms | 450ms | N/A |

Benchmarks run on AWS c5.2xlarge instances with 10Gbps networking.

## Implementation Details

The core consensus logic is implemented as a state machine:

```rust
pub enum State {
    Follower {
        current_term: u64,
        voted_for: Option<NodeId>,
        log: Log,
    },
    Candidate {
        current_term: u64,
        votes_received: HashSet<NodeId>,
        log: Log,
    },
    Leader {
        current_term: u64,
        next_index: HashMap<NodeId, u64>,
        match_index: HashMap<NodeId, u64>,
        log: Log,
    },
}
```

### Key Optimizations

1. **Batched Append Entries**: Group multiple log entries in a single RPC to reduce network overhead
2. **Pipeline Replication**: Allow multiple outstanding AppendEntries RPCs to improve throughput
3. **Read Index Optimization**: Serve reads from followers without compromising consistency
4. **Pre-voting**: Prevent unnecessary elections in partitioned networks

## Use Cases

Quasar has been used in production for:

- Distributed configuration management
- Service discovery and coordination
- Distributed locking primitives
- Metadata storage for distributed file systems

## References

- [Raft Paper](https://example.com/raft-paper)
- [Performance Analysis](https://example.com/quasar-benchmarks)
- [Source Code](https://example.com/quasar-repo)

<details>
<summary>Future Work</summary>

Planned improvements include:

- Support for joint consensus (configuration changes)
- Integration with hardware-accelerated checksums
- Cross-region replication with eventual consistency options
- Pluggable storage backends (RocksDB, SQLite, in-memory)

</details>
