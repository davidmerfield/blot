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
    if (err) throw err;

    if (redirect) return callback(null, redirect);

    check(0);

    function check(cursor) {
      // SORTED SET, precedence is important
      // SSCAN myset 0 match 'Wo*'

      client.ZSCAN(redirects, cursor, function (err, response) {
        if (err) throw err;

        if (!response || !response.length) {
          return callback();
        }

        var cursor = response[0];
        var matches = response[1];

        if (!matches.length) return callback();

        for (var i = 0; i < matches.length; i = i + 2)
          if (isRegex(matches[i]) && is(input, matches[i]))
            return get(blogID, matches[i], callback, input);

        // Nothing found :(
        if (cursor === "0") {
          return callback();
        }

        // Nothing found here, but more to search
        if (cursor !== "0") {
          return check(cursor);
        }
      });
    }
  });
};
