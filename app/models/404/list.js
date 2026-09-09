var client = require("models/client");
var ensure = require("helper/ensure");
var key = require("./key");
var moment = require("moment");

module.exports = function (blogID, callback) {
  ensure(blogID, "string").and(callback, "function");

  var everythingKey = key.everything(blogID);
  var ignoreKey = key.ignore(blogID);

  ensure(everythingKey, "string").and(ignoreKey, "string");

  (async function () {
    try {
      var data = await Promise.all([
        client.sMembers(ignoreKey),
        client.zRangeWithScores(everythingKey, 0, -1, { REV: true }),
      ]);

      var ignoreThese = data[0];
      var response = data[1];

      ensure(ignoreThese, "array").and(response, "array");

      var list = [];
      var ignored = [];

      for (var itemIndex in response) {
        var entry = response[itemIndex];

        var item = {
          url: entry.value,
          time: moment.utc(entry.score).fromNow(),
        };

        if (ignoreThese.indexOf(entry.value) > -1) {
          ignored.push(item);
        } else {
          list.push(item);
        }
      }

      return callback(null, list, ignored);
    } catch (err) {
      return callback(err);
    }
  })();
};
