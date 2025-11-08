---
pub: true
---

If you're planning on failing over to a secondary backend (e.g. primary/replica database), you might consider sending some fraction of traffic to the replica during normal (i.e. primary) operation, both to ensure the replica is functioning properly and alert if it isn't, and to warm the secondary backend. 

These are referred to as "Shadow reads".

Often your code will perform the shadow read asynchronously, so as not to slow down primary processing, and log but do not fail in the event of errors. Your code may also diff the results from the secondary backend against the primary backend to learn about any semantic divergence.