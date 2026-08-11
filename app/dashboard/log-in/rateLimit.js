const { rateLimit}  = require("express-rate-limit");
const { RedisStore } = require('rate-limit-redis')
const redis = require("redis");
const config = require("config");

// connect-redis 9 uses the promise API (get/set/del with options), so we need
// a native redis 5 client, not the legacy-mode client from models/redis
const client = redis.createClient({
  url: `redis://${config.redis.host}:${config.redis.port}`,
});
client.connect().catch((err) => {
  console.error("Rate limit Redis connect error:", err);
});

var limiter = rateLimit({
  store: new RedisStore({
    prefix: "rate-limit:log-in:",
    // Redis store configuration
		sendCommand: (command, ...args) => client.sendCommand([command, ...args]),
  }),
  windowMs: 60000, // one minute window
  max: 120, // 2 attempts per second
});

module.exports = limiter;
