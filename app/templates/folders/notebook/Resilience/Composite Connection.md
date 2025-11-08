---
pub: true
---

A resilience technique: A composite connection wraps two or more connections to a backend, and uses a dynamic mix of strategies for querying them.

For instance, one might wrap a connection to a database primary and replica, and have a flaggable configuration that allows one to swap between sending traffic fully to the primary, fully to the replica, to the primary with [[Circuit Breaker]] failover to the replica, or with a certain ratio of [[Shadow reads]].