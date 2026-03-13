const { promisify } = require("util");
const redis = require("models/redis");
const client = new redis();

const scan = promisify(client.scan.bind(client));

async function redisKeys(pattern, iterator) {
  let cursor = "0";
  let complete = false;

  while (!complete) {
    try {
      const [nextCursor, results] = await scan(
        cursor,
        "match",
        pattern,
        "count",
        1000
      );
      cursor = nextCursor;

      for (const result of results) {
        await iterator(result);
      }

      complete = cursor === "0";
    } catch (err) {
      throw err;
    }
  }
}

module.exports = redisKeys;
