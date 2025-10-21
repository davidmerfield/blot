// docker exec -it blot-node-app-1 node scripts/db/remove-metadata-model-keys.js
// return "blog:" + blogID + ":folder:everything";
// return "blog:" + blogID + ":folder:" + pathNormalizer(path);

const keys = require("../util/redisKeys");
const client = require("models/client");
const { promisify } = require("util");
const del = promisify(client.del).bind(client);

const main = async () => {
  const pattern = "blog:*:folder:*";
  await keys(pattern, async (key) => {
    // match alphanumieric characters and underscores between blog: and :folder
    // we want to avoid a situation where some other key has ':folder:' in it deeper in the key
    const blogID = key.match(/blog:([a-zA-Z0-9_]+):folder:/)?.[1];

    if (!blogID.startsWith("blog_")) {
      return console.log("Skipping blogID wrong prefix", key);
    }

    if (blogID.length !== "blog_a1cdeabcdee44aaaa5e1b7ed44717e32".length) {
      return console.log("Skipping blogID wrong length", key);
    }

    if (!key.startsWith("blog:" + blogID + ":folder:")) {
      return console.log("Skipping key wrong prefix", key);
    }

    const restOfKey = key.slice(("blog:" + blogID + ":folder:").length);

    if (restOfKey !== "everything" && !restOfKey.startsWith("/")) {
      return console.log("Skipping key wrong format", key);
    }

    console.log("Deleting", key);
    await del(key);
  });
};

if (require.main === module) {
  main()
    .then(() => {
      console.log("Processed all keys");
      process.exit(0);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
