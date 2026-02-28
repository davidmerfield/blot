const colors = require("colors/safe");
const redisKeys = require("../util/redisKeys");
const createRedisClient = require("../util/createRedisClient");
const getConfirmation = require("../util/getConfirmation");

const LEGACY_PATTERN = "blog:*:tags:entries:*";
const KEY_FORMAT = /^blog:([^:]+):tags:entries:(.+)$/;
const DELETE_BATCH_SIZE = 500;

async function collectLegacyKeys(blogID, client) {
  const pattern = blogID ? `blog:${blogID}:tags:entries:*` : LEGACY_PATTERN;

  const keysByBlog = new Map();

  await redisKeys(
    pattern,
    async (key) => {
      if (!KEY_FORMAT.test(key)) return;

      const [, id] = key.match(KEY_FORMAT) || [];

      if (!id) return;

      if (blogID && id !== blogID) return;

      if (!keysByBlog.has(id)) keysByBlog.set(id, []);
      keysByBlog.get(id).push(key);
    },
    client
  );

  return keysByBlog;
}

async function removeLegacyTagSetKeys(blogID, client) {
  const keysByBlog = await collectLegacyKeys(blogID, client);
  const allKeys = Array.from(keysByBlog.values()).flat();

  if (!allKeys.length) {
    console.log(colors.green("No legacy tag set keys found."));
    return;
  }

  console.log(colors.cyan("Found legacy tag set keys:"));
  keysByBlog.forEach((keys, id) => {
    console.log(colors.yellow(`- blog:${id} (${keys.length} keys)`));
  });

  const confirmed = await getConfirmation(
    `Delete ${allKeys.length} legacy tag set key${allKeys.length === 1 ? "" : "s"}?`
  );

  if (!confirmed) {
    console.log(colors.yellow("Aborted without deleting any keys."));
    return;
  }

  let totalDeleted = 0;

  for (let i = 0; i < allKeys.length; i += DELETE_BATCH_SIZE) {
    const batchKeys = allKeys.slice(i, i + DELETE_BATCH_SIZE);
    const replies = await client.multi(batchKeys.map((key) => ["DEL", key])).exec();
    const batchDeleted = Array.isArray(replies)
      ? replies.reduce((sum, value) => sum + (typeof value === "number" ? value : 0), 0)
      : 0;
    totalDeleted += batchDeleted;
  }

  console.log(
    colors.green(
      `Deleted ${allKeys.length} key${allKeys.length === 1 ? "" : "s"}. Redis removed ${totalDeleted} key${totalDeleted === 1 ? "" : "s"}.`
    )
  );
}

if (require.main === module) {
  const blogID = process.argv[2];

  (async () => {
    const { client, close } = await createRedisClient();
    try {
      await removeLegacyTagSetKeys(blogID, client);
      await close();
      process.exit(0);
    } catch (error) {
      console.error(colors.red("Error:", error.message));
      await close();
      process.exit(1);
    }
  })();
}

module.exports = removeLegacyTagSetKeys;
