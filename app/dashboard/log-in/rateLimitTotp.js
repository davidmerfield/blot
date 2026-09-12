const { rateLimit } = require("express-rate-limit");
const { RedisStore } = require("rate-limit-redis");
const redis = require("redis");
const config = require("config");

// Two-factor codes are only 6 digits, so brute-forcing them needs a much
// tighter limit than the log-in form's email/password rate limit.
const client = redis.createClient({
  url: `redis://${config.redis.host}:${config.redis.port}`,
  RESP: 2,
  commandOptions: { timeout: undefined },
  socket: { keepAliveInitialDelay: 5000 },
});
client.connect().catch((err) => {
  console.error("Two-factor rate limit Redis connect error:", err);
});

var limiter = rateLimit({
  store: new RedisStore({
    prefix: "rate-limit:log-in-totp:",
    sendCommand: (command, ...args) => client.sendCommand([command, ...args]),
  }),
  windowMs: 5 * 60000, // five minute window
  max: 10, // 10 attempts per five minutes
});

module.exports = limiter;
