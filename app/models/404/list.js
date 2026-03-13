var client = require("models/client");
var ensure = require("helper/ensure");
var key = require("./key");
var moment = require("moment");

module.exports = function (blogID, callback) {
  ensure(blogID, "string").and(callback, "function");

  var everythingKey = key.everything(blogID);
  var ignoreKey = key.ignore(blogID);

  ensure(everythingKey, "string").and(ignoreKey, "string");

  client.SMEMBERS(ignoreKey, function (err, ignoreThese) {
    if (err) throw err;

    ensure(ignoreThese, "array");

    client.ZREVRANGE(everythingKey, 0, -1, "WITHSCORES", function (
      err,
      response
    ) {
      if (err) throw err;

      ensure(response, "array");

      var list = [];
      var ignored = [];

      for (var i in response) {
        if (i % 2) continue;

        var url = response[i];
        var timeStamp = parseInt(response[++i]);

        var item = {
          url: url,
          time: moment.utc(timeStamp).fromNow(),
        };

        if (ignoreThese.indexOf(url) > -1) {
          ignored.push(item);
        } else {
          list.push(item);
        }
      }

      return callback(null, list, ignored);
    });
  });
};
