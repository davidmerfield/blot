const { rateLimit, ipKeyGenerator } = require("express-rate-limit");
const { RedisStore } = require("rate-limit-redis");
const redis = require("redis");
const config = require("config");
const pendingTotp = require("./pendingTotp");

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
  // Key by the account being logged into, not the request IP: a six-digit
  // code is weak enough that an attacker distributing attempts across many
  // IPs must still be capped on a per-account basis. Fall back to the IP
  // for any request that somehow reaches this without a pending session.
  keyGenerator: (req) => {
    var pending = pendingTotp.get(req);
    // ipKeyGenerator normalizes IPv6 addresses to a subnet so an attacker
    // can't bypass the IP-fallback bucket by cycling through addresses
    // within their own /64.
    return (pending && pending.uid) || ipKeyGenerator(req.ip);
  },
});

module.exports = limiter;
