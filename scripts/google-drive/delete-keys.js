const redisKeys = require("../util/redisKeys");
const createRedisClient = require("../util/createRedisClient");

const MATCH = "clients:google-drive:*";

async function main(client) {
  console.log("Searching '" + MATCH + "'");

  const foundKeys = [];

  await redisKeys(
    MATCH,
    async (key) => {
      foundKeys.push(key);
    },
    client
  );

  if (!foundKeys.length) return;

  console.log();
  console.log("Found", foundKeys.length, "keys");

  for (const key of foundKeys) {
    if (!key.startsWith("clients:google-drive:")) {
      console.log("Skipping", key);
      continue;
    }

    console.log("Deleting", key);
    await client.del(key);
  }
}

if (require.main === module) {
  (async () => {
    const { client, close } = await createRedisClient();
    try {
      await main(client);
      console.log("Done!");
      console.log();
      await close();
      process.exit(0);
    } catch (err) {
      console.error(err);
      await close();
      process.exit(1);
    }
  })();
}
