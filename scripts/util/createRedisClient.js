const createClient = require("models/redis-new");

module.exports = async function createRedisClient() {
  const client = createClient();
  await client.connect();

  let closed = false;

  return {
    client,
    async close() {
      if (closed) return;
      closed = true;

      try {
        await client.quit();
      } catch (error) {
        client.disconnect();
      }
    },
  };
};
