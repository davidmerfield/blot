const createRedisClient = require("./createRedisClient");

async function redisKeys(pattern, iterator, redisClient) {
  let ownClient = null;
  let client = redisClient;

  if (!client) {
    ownClient = await createRedisClient();
    client = ownClient.client;
  }

  let cursor = "0";
  let complete = false;

  try {
    while (!complete) {
      const reply = await client.scan(cursor, {
        MATCH: pattern,
        COUNT: 1000,
      });

      const nextCursor = String(reply.cursor);
      const results = Array.isArray(reply.keys) ? reply.keys : [];
      cursor = nextCursor;

      for (const result of results) {
        await iterator(result);
      }

      complete = cursor === "0";
    }
  } finally {
    if (ownClient) {
      await ownClient.close();
    }
  }
}

module.exports = redisKeys;
