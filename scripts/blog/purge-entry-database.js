const colors = require("colors/safe");
const getBlog = require("../get/blog");
const redisKeys = require("../util/redisKeys");
const createRedisClient = require("../util/createRedisClient");
const getConfirmation = require("../util/getConfirmation");

const ENTRY_LISTS = [
  "all",
  "created",
  "entries",
  "drafts",
  "scheduled",
  "pages",
  "deleted",
];

async function collectKeys(blog, client) {
  const blogPrefix = `blog:${blog.id}:`;
  const patterns = [
    ...ENTRY_LISTS.map((list) => `${blogPrefix}${list}`),
    `${blogPrefix}entry:*`,
    `${blogPrefix}url:*`,
    `${blogPrefix}dependents:*`,
    `${blogPrefix}tags:all`,
    `${blogPrefix}tags:entries-by-dateStamp:*`,
    `${blogPrefix}tags:entry:*`,
    `${blogPrefix}tags:name:*`,
    `${blogPrefix}ignored_files`,
  ];

  const keys = new Set();

  for (const pattern of patterns) {
    await redisKeys(
      pattern,
      async (key) => {
        if (key.startsWith(blogPrefix)) keys.add(key);
      },
      client
    );
  }

  return Array.from(keys);
}

async function main(blog, client) {
  const keys = await collectKeys(blog, client);

  if (!keys.length) {
    console.log(colors.yellow("No keys to delete."));
    return;
  }

  console.log(colors.cyan("Found the following keys:"));
  console.log(JSON.stringify(keys, null, 2));

  const confirmed = await getConfirmation(`Delete ${keys.length} keys`);

  if (!confirmed) {
    console.log(colors.yellow("Aborted without deleting any keys."));
    return;
  }

  const replies = await client.multi([["DEL", ...keys]]).exec();
  const deleted = Array.isArray(replies)
    ? replies.reduce((sum, value) => sum + (typeof value === "number" ? value : 0), 0)
    : 0;

  console.log(
    colors.green(
      `Deleted ${keys.length} keys for blog ${blog.id}. Redis removed ${deleted} keys.`
    )
  );
}

if (require.main === module) {
  getBlog(process.argv[2], function (err, user, blog) {
    if (err) throw err;

    (async () => {
      const { client, close } = await createRedisClient();
      try {
        await main(blog, client);
        await close();
        process.exit(0);
      } catch (error) {
        console.error(colors.red("Error:", error.message));
        await close();
        process.exit(1);
      }
    })();
  });
}

module.exports = main;
