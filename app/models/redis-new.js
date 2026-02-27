const config = require("config");
const redis = require("redis");

const url = `redis://${config.redis.host}:${config.redis.port}`;

module.exports = function () {
  const client = redis.createClient({
    url,
    RESP: 3,
    clientSideCache: {
      ttl: 0,
      maxEntries: 10000,
      evictPolicy: "LRU",
    },
  });

  return client;
};
