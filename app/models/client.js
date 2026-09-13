/**
 * Shared singleton Redis client for the "new" client path.
 *
 * Lifecycle contract:
 * - This module owns the process-wide singleton connection.
 * - Consumers should NOT call `quit()`/`disconnect()` on this client.
 * - Use `redis` directly when you need a dedicated client with an
 *   independent lifecycle that can be explicitly closed.
 */
const client = require("./redis")();

client.connect().catch((err) => {
  console.error("Redis connect error:", err);
});

module.exports = client;
