const colors = require("colors/safe");
const client = require("models/client");
const redisKeys = require("../util/redisKeys");
const getConfirmation = require("../util/getConfirmation");

const LEGACY_PATTERN = "blog:*:tags:entries:*";
const KEY_FORMAT = /^blog:([^:]+):tags:entries:(.+)$/;

async function collectLegacyKeys(blogID) {
  const pattern = blogID
    ? `blog:${blogID}:tags:entries:*`
    : LEGACY_PATTERN;

  const keysByBlog = new Map();

  await redisKeys(pattern, async (key) => {
    if (!KEY_FORMAT.test(key)) return;

    const [, id] = key.match(KEY_FORMAT) || [];

    if (!id) return;

    if (blogID && id !== blogID) return;

    if (!keysByBlog.has(id)) keysByBlog.set(id, []);
    keysByBlog.get(id).push(key);
  });

  return keysByBlog;
}

async function removeLegacyTagSetKeys(blogID) {
  const keysByBlog = await collectLegacyKeys(blogID);
  const allKeys = Array.from(keysByBlog.values()).flat();

  if (!allKeys.length) {
    console.log(colors.green("No legacy tag set keys found."));
    return;
  }

  console.log(colors.cyan("Found legacy tag set keys:"));
  keysByBlog.forEach((keys, id) => {
    console.log(
      colors.yellow(`- blog:${id} (${keys.length} keys)`)
    );
  });

  const confirmed = await getConfirmation(
    `Delete ${allKeys.length} legacy tag set key${
      allKeys.length === 1 ? "" : "s"
    }?`
  );

  if (!confirmed) {
    console.log(colors.yellow("Aborted without deleting any keys."));
    return;
  }

  await new Promise((resolve, reject) => {
    const multi = client.multi();
    allKeys.forEach((key) => multi.del(key));
    multi.exec((err, results) => {
      if (err) return reject(err);

      const deleted = Array.isArray(results)
        ? results.reduce(
            (sum, value) => sum + (typeof value === "number" ? value : 0),
            0
          )
        : 0;

      console.log(
        colors.green(
          `Deleted ${allKeys.length} key${
            allKeys.length === 1 ? "" : "s"
          }. Redis removed ${deleted} key${deleted === 1 ? "" : "s"}.`
        )
      );

      resolve();
    });
  });
}

if (require.main === module) {
  const blogID = process.argv[2];

  removeLegacyTagSetKeys(blogID)
    .then(() => process.exit())
    .catch((error) => {
      console.error(colors.red("Error:", error.message));
      process.exit(1);
    });
}

module.exports = removeLegacyTagSetKeys;
