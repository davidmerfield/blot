const config = require("config");
const path = require("path");
const net = require("net");
const clfdate = require("helper/clfdate");

const PAGE = path.resolve(__dirname + "/../views/error-redis-unavailable.html");

// node-redis rejects with these when the client cannot reach the server
const CLIENT_ERROR_NAMES = new Set([
  "ClientOfflineError",
  "ClientClosedError",
  "ConnectionTimeoutError",
  "SocketTimeoutError",
  "SocketClosedUnexpectedlyError",
  "ReconnectStrategyError",
]);

// Network errors are only ours if they were aimed at the Redis server,
// otherwise an unreachable third party (Dropbox, Stripe) looks like an outage
const SOCKET_ERROR_CODES = new Set([
  "ECONNREFUSED",
  "ECONNRESET",
  "ETIMEDOUT",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "ENOTFOUND",
  "EAI_AGAIN",
  "EPIPE",
]);

function isRedisUnavailableError(err, depth = 0) {
  if (!err || typeof err !== "object" || depth > 2) return false;

  if (CLIENT_ERROR_NAMES.has(err.constructor && err.constructor.name)) {
    return true;
  }

  if (SOCKET_ERROR_CODES.has(err.code)) {
    const redis = config.redis || {};
    // Node reports the target as port + address (connect) or hostname (lookup)
    const target = err.address !== undefined ? err.address : err.hostname;
    const portMatches =
      err.port === undefined || Number(err.port) === Number(redis.port);
    // Node reports the resolved IP, so a DNS name like "redis" can only be
    // matched on the port
    const hostMatches =
      target === undefined ||
      target === redis.host ||
      net.isIP(String(redis.host)) === 0;

    // Require at least one identifying field so a bare ECONNRESET is not ours
    if (
      (err.port !== undefined || target !== undefined) &&
      portMatches &&
      hostMatches
    ) {
      return true;
    }
  }

  return isRedisUnavailableError(err.cause || err.originalError, depth + 1);
}

// Express error middleware: any request that failed because Redis is
// unreachable gets a 503 and a generic page, everything else passes through.
function redisUnavailableHandler(err, req, res, next) {
  if (!isRedisUnavailableError(err)) return next(err);

  console.error(
    clfdate(),
    req.headers && req.headers["x-request-id"] || "-",
    "Redis unavailable:",
    err.message
  );

  // Response already started, nothing more we can tell the client
  if (res.headersSent) return res.end();

  res.status(503);
  res.set({ "Retry-After": "60", "Cache-Control": "no-store" });
  res.sendFile(PAGE, function (sendErr) {
    if (sendErr && !res.headersSent) res.type("text").send("Service unavailable");
  });
}

module.exports = { isRedisUnavailableError, redisUnavailableHandler };
