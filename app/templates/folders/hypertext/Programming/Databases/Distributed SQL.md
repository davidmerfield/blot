# Distributed SQL

I'm impressed by the FoundationDB [Record Layer](https://www.foundationdb.org/files/record-layer-paper.pdf) and [Queueing system](https://www.foundationdb.org/files/QuiCK.pdf). 

They seem to spend a lot of time on things that make large stateful systems difficult to operate. They ensure every operation does a bounded, small amount of work, use retries over locking, support tenant fairness and isolation, and have carefully thought through migrating tenants across clusters as well.

I expect peak performance might be worse than many competitive systems, but I'd expect FoundationDB to be much more predictable and consistent. That's worth a lot.