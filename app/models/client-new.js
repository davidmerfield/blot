/**
 * Shared singleton Redis client for the "new" client path.
 *
 * Lifecycle contract:
 * - This module owns the process-wide singleton connection.
 * - Consumers should NOT call `quit()`/`disconnect()` on this client.
 * - Use `redis-new` directly when you need a dedicated client with an
 *   independent lifecycle that can be explicitly closed.
 */
const client = require("./redis-new")();

client.connect().catch((err) => {
  console.log("Redis connect error:");
  console.log(err);
  if (err.trace) console.log(err.trace);
  if (err.stack) console.log(err.stack);
});

module.exports = client;
