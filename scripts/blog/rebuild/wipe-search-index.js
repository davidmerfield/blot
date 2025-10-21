var colors = require("colors/safe");
var get = require("../../get/blog");
var Keys = require("../../db/keys");
var keysToDelete = [];
var client = require("client");
var getConfirmation = require("../util/getConfirmation");

if (require.main === module) {
  get(process.argv[2], function (err, user, blog) {
    if (err) throw err;

    main(blog, function (err) {
      if (err) {
        console.error(colors.red("Error:", err.message));
        return process.exit(1);
      }
      process.exit();
    });
  });
}

function main(blog, callback) {
  var multi = client.multi();
  Keys(
    `blog:${blog.id}:search:*`,
    function (keys, next) {
      keysToDelete = keysToDelete.concat(keys);
      next();
    },
    function (err) {
      if (err) throw err;
      if (!keysToDelete.length) {
        console.log("No keys to delete");
        process.exit();
      }
      console.log(JSON.stringify(keysToDelete, null, 2));
      getConfirmation(
        "Delete " + keysToDelete.length + " keys? (y/n)",
        function (err, ok) {
          if (!ok) return callback();
          multi.del(keysToDelete);
          multi.exec(callback);
        }
      );
    }
  );
}
