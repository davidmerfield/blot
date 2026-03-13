var client = require("models/client");
var ensure = require("helper/ensure");
var key = require("./key");
var _ = require("lodash");

module.exports = function (blogID, callback) {
  ensure(blogID, "string").and(callback, "function");

  var redirects = key.redirects(blogID);

  client.zrange(redirects, 0, -1, function (err, froms) {
    if (err) throw err;

    if (!froms.length) return callback(null, []);

    var fromKeys = _.map(froms, function (from) {
      return key.redirect(blogID, from);
    });

    client.mget(fromKeys, function (err, tos) {
      if (err) throw err;

      if (tos.length !== froms.length) throw "Length mismatch";

      // console.log(tos);

      var allRedirects = _.zip(froms, tos);

      var i = 0;

      allRedirects = _.map(allRedirects, function (redir) {
        return {
          from: redir[0],
          to: redir[1],
          index: i++,
        };
      });

      // console.log(allRedirects);

      callback(null, allRedirects);
    });
  });
};
