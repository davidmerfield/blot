var client = require("models/client");
var ensure = require("helper/ensure");
var key = require("./key");
var util = require("./util");
var map = util.map;
var notRegex = util.notRegex;

module.exports = function (blogID, from, callback, input) {
  ensure(blogID, "string").and(from, "string").and(callback, "function");

  var fromKey = key.redirect(blogID, from);

  client.get(fromKey, function (err, to) {
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

    return callback(err, redirect);
  });
};
