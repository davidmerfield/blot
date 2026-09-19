const config = require("config");
const path = require("path");
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
    if (
      (err.port !== undefined && Number(err.port) === Number(redis.port)) ||
      (err.address !== undefined && err.address === redis.host) ||
      (err.hostname !== undefined && err.hostname === redis.host)
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
  res.set({ "Retry-After": "10", "Cache-Control": "no-store" });
  res.sendFile(PAGE, function (sendErr) {
    if (sendErr && !res.headersSent) res.type("text").send("Service unavailable");
  });
}

module.exports = { isRedisUnavailableError, redisUnavailableHandler };
