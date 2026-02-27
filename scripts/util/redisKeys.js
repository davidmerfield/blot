const redis = require("models/redis");
const client = new redis();

async function redisKeys(pattern, iterator) {
  for await (const keys of client.scanIterator({ MATCH: pattern, COUNT: 1000 })) {
    for (const key of keys) {
      await iterator(key);
    }
  }
}

module.exports = redisKeys;
