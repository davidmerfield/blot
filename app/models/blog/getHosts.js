var client = require("models/client");
var ensure = require("helper/ensure");
var key = require("./key");
var getAllIDs = require("./getAllIDs");

var HOST = require("config").host;

// returns list of pairs [host, blogID]

module.exports = function getHosts(callback) {
  ensure(callback, "function");

  getAllIDs(function (err, ids) {
    if (err) throw err;

    Promise.all(
      ids.map(function (id) {
        return client.hmGet(key.info(id), ["domain", "handle"]);
      })
    )
      .then(function (res) {
        var hosts = [];

        res.forEach(function (keys, i) {
          if (keys && keys[0]) hosts.push([keys[0], ids[i]]);
          if (keys && keys[1]) hosts.push([keys[1] + "." + HOST, ids[i]]);
        });

        return callback(null, hosts);
      })
      .catch(function (err) {
        return callback(err);
      });
  });
};
