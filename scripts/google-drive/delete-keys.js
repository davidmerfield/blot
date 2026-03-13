const keys = require("../db/keys");
const client = require("client");

const MATCH = "clients:google-drive:*";

function main(callback) {

  console.log("Searching '" + MATCH + "'");

  keys(
    MATCH,
    async (keys, next) => {
        if (!keys.length) return next();

        console.log();
        console.log("Found", keys.length, "keys");

        for (const key of keys) {

            if (!key.startsWith("clients:google-drive:")) {
                console.log("Skipping", key);
                continue;
            }

            console.log("Deleting", key);
            await client.del(key);
        }

        next();
    },
    callback
  );
}

if (require.main === module) {
  main(function (err) {
    if (err) throw err;

    console.log("Done!");
    console.log();
    process.exit();
  });
}