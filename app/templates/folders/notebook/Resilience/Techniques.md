---
pub: true
---

Suppose you have a backend or data store that sometimes fails, but you want to continue serving traffic

- Use a [[Circuit Breaker]] to fail efficiently or fallback to a different source or behavior.
- Use a [[Composite Connection]] to transparently handle failover
- Use a read replica instead of the primary
- Retry, with jittered exponential backoff
- Buffer writes in a different store or a queue, and asynchronously apply them when the backend is available

