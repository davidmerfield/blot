var client = require("models/client-new");
var ensure = require("helper/ensure");
var key = require("./key");
var util = require("./util");
var map = util.map;
var notRegex = util.notRegex;

module.exports = function (blogID, from, callback, input) {
  ensure(blogID, "string").and(from, "string").and(callback, "function");

  var fromKey = key.redirect(blogID, from);

  (async function () {
    try {
      var to = await client.get(fromKey);

      if (notRegex(to) || !input) {
        return callback(null, to);
      }

      // this is only neccessary for from, if from is a regex
      var redirect;

      try {
        redirect = map(input, from, to);
      } catch (e) {}

      // WE SHOULD CACHE THIS RESPONSE HERE.... ?
      // HOW TO BIND IT to the core FROM PATTERN ?
      redirect = redirect !== from ? redirect : null;

      return callback(null, redirect);
    } catch (err) {
      return callback(err);
    }
  })();
};
