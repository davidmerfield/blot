A circuit breaker tracks failures over time, and in response to a pattern of failures, "opens" and causes a system to fail quickly or fall back to a secondary behavior.

A simple circuit breaker might open after a single failure, wait for a timeout, and then attempt to close. If the attempt to close fails, increment a retry count, and wait for an exponentially longer timeout with some jitter. If the attempt to close succeeds, then stay closed and reset the retry count.

You might enhance the triggering condition to look for a failure rate over a rolling window, or a relative increase in latency.

You might enhance the retry behavior to instead of simple re-closing, perform a health check.