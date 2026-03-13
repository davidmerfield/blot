var client = require("models/client");
var ensure = require("helper/ensure");
var key = require("./key");
var util = require("./util");
var matches = util.matches;

// var drop = require('./drop');

module.exports = function (blogID, mappings, callback) {
  ensure(blogID, "string").and(mappings, "array").and(callback, "function");

  var redirects = key.redirects(blogID);
  var multi = client.multi();

  client.zrange(redirects, 0, -1, function (err, all_keys) {
    if (err) return callback(err);

    all_keys = all_keys || [];

    all_keys = all_keys.map(function (from) {
      return key.redirect(blogID, from);
    });

    all_keys.push(redirects);

    multi.del(all_keys);

    mappings.forEach(function (redirect, index) {
      var from = redirect.from;
      var to = redirect.to;
      var fromKey = key.redirect(blogID, from);

      index = parseInt(index);

      if (isNaN(index)) throw new Error("forEach returned a NaN index");

      var candidates = mappings.slice(0, index);

      // If either the 'from' rule or the 'to' rule
      // are empty strings then delete this rule.
      // If the 'to' rule matches a 'from' rule which
      // comes before it ('candidates') this would cause
      // a re-direct loop, so drop this rule.
      // drop(blogID, from, next);
      if (!from || !to || matches(to, candidates)) return;

      ensure(from, "string")
        .and(to, "string")
        .and(index, "number")
        .and(fromKey, "string")
        .and(redirects, "string");

      multi.zadd(redirects, index, from);
      multi.set(fromKey, to);
    });

    multi.exec(callback);
  });
};
