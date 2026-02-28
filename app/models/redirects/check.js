var client = require("models/client");
var ensure = require("helper/ensure");
var key = require("./key");
var get = require("./get");
var util = require("./util");
var is = util.is;
var isRegex = util.isRegex;

module.exports = function (blogID, input, callback) {
  ensure(blogID, "string").and(input, "string").and(callback, "function");

  var redirects = key.redirects(blogID);

  get(blogID, input, function (err, redirect) {
    if (err) return callback(err);

    if (redirect) return callback(null, redirect);

    (async function () {
      try {
        var cursor = "0";

        while (true) {
          // SORTED SET, precedence is important
          var response = await client.zScan(redirects, cursor);

          if (!response) return callback();

          cursor = response.cursor;
          var matches = response.members || [];

          if (!matches.length && cursor === "0") {
            return callback();
          }

          for (var i = 0; i < matches.length; i++) {
            var from = matches[i].value;

            if (isRegex(from) && is(input, from)) {
              return get(blogID, from, callback, input);
            }
          }

          if (cursor === "0") {
            return callback();
          }
        }
      } catch (scanErr) {
        return callback(scanErr);
      }
    })();
  });
};
