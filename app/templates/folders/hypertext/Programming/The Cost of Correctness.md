# The Cost of Correctness

Building distributed systems requires navigating a fundamental tension: the desire for correctness against the practical constraints of performance and complexity. Every design decision involves trade-offs, and nowhere is this more apparent than in consensus algorithms.

When I began working on [[Quasar]], I was initially drawn to the mathematical elegance of Raft. The algorithm's guarantees—strong consistency, fault tolerance, linearizability—seemed like exactly what distributed systems needed. But as we moved from prototype to production, the costs became clear.

## The Illusion of Simplicity

Raft promises simplicity. The paper claims it's easier to understand than Paxos, and in some sense this is true. The state machine is straightforward: followers, candidates, leaders. The rules are clear. But simplicity in specification doesn't translate to simplicity in implementation.

Consider leader election. The algorithm specifies randomized timeouts to prevent split votes. Simple enough. But in practice, you must choose:

- How to implement randomness (cryptographically secure? fast PRNG?)
- How to handle clock skew across nodes
- What to do when elections take too long
- How to prevent cascading elections in large clusters

Each choice introduces complexity. Each optimization—batching, pipelining, read optimization—adds edge cases. The "simple" algorithm becomes a web of conditionals and state transitions.

## The Performance Tax

Strong consistency comes at a cost. Every write in [[Quasar]] must be replicated to a majority of nodes before acknowledgment. Network latency becomes a bottleneck. In a geo-distributed deployment, a write from Tokyo to a cluster spanning Tokyo, London, and New York might take 200ms just for the network round-trip.

We can optimize—batch writes, pipeline replication, use read replicas—but these are mitigations, not solutions. The fundamental constraint remains: consensus requires communication, and communication has latency.

Some systems abandon strong consistency entirely. Eventual consistency allows writes to complete locally, propagating asynchronously. But this introduces new problems: conflict resolution, read-your-writes guarantees, handling network partitions.

## The Complexity Budget

Every system has a complexity budget. You can spend it on correctness, performance, features, or operational simplicity. The challenge is allocation.

In [[Quasar]], we chose to spend heavily on correctness and operational simplicity. The codebase is larger than it might be, but failures are predictable. When something goes wrong, the logs tell a clear story. The state machine is explicit, the transitions are logged, debugging is straightforward.

Compare this to systems that optimize primarily for performance. They're faster, but when they fail, they fail in mysterious ways. State becomes inconsistent, debugging requires deep expertise, recovery is manual and error-prone.

## The Right Abstraction

The real insight isn't that correctness is expensive—it's that the right abstraction can make correctness affordable. [[Quasar]] provides a clean interface: append a log entry, read committed state, handle leader changes. The complexity is encapsulated.

This is why type systems matter. [[Neon]]'s compile-time query checking catches errors that would otherwise surface in production. The abstraction—type-safe queries—makes correctness the default rather than an afterthought.

Similarly, [[Prism]]'s zero-copy architecture doesn't just improve performance—it reduces the surface area for bugs. Fewer copies mean fewer opportunities for data corruption. The abstraction enforces correctness.

## Conclusion

Correctness isn't free, but neither is incorrectness. The question isn't whether to pay, but when and how. Sometimes the right answer is strong consistency and predictable performance. Sometimes it's eventual consistency and higher throughput. Sometimes it's a hybrid approach.

The key is making the trade-offs explicit, understanding the costs, and choosing abstractions that make correctness easier rather than harder. Because in distributed systems, as in life, the easy path is rarely the right one.

## References

- [Raft Paper](https://example.com/raft-paper)
- [Consistency Trade-offs](https://example.com/consistency-tradeoffs)
- [Distributed Systems Theory](https://example.com/distributed-theory)
