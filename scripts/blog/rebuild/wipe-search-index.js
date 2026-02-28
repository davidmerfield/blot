var colors = require("colors/safe");
var get = require("../../get/blog");
var Keys = require("../../db/keys");
var keysToDelete = [];
var createRedisClient = require("../../util/createRedisClient");
var getConfirmation = require("../util/getConfirmation");

if (require.main === module) {
  get(process.argv[2], function (err, user, blog) {
    if (err) throw err;

    (async function () {
      var redis = await createRedisClient();
      main(redis.client, blog, async function (err) {
        if (err) {
          console.error(colors.red("Error:", err.message));
          await redis.close();
          return process.exit(1);
        }
        await redis.close();
        process.exit();
      });
    })();
  });
}

function main(client, blog, callback) {
  Keys(
    `blog:${blog.id}:search:*`,
    function (keys, next) {
      keysToDelete = keysToDelete.concat(keys);
      next();
    },
    function (err) {
      if (err) return callback(err);
      if (!keysToDelete.length) {
        console.log("No keys to delete");
        return callback();
      }
      console.log(JSON.stringify(keysToDelete, null, 2));
      getConfirmation("Delete " + keysToDelete.length + " keys? (y/n)", function (err, ok) {
        if (err) return callback(err);
        if (!ok) return callback();

        client
          .multi([["DEL", ...keysToDelete]])
          .exec()
          .then(function () {
            callback();
          }, callback);
      });
    }
  );
}
