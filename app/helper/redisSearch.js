var redis = require("models/redis");
var client = new redis();
var async = require("async");

function main(string, callback) {
  var types = {};
  var result = [];

  redisKeys(
    "*",
    function (keys, callback) {
      async.each(
        keys,
        function (key, next) {
          if (key.indexOf(string) > -1)
            result.push({ key: key, value: "KEY ITSELF", type: "KEY" });

          client.type(key, function (err, type) {
            if (err) return next(err);

            types[type] = types[type] || [];
            types[type].push(key);

            next();
          });
        },
        function (err) {
          if (err) return callback(err);

          async.eachOf(
            types,
            function (keys, type, next) {
              if (type === "string") {
                stringSearch(string, keys, result, next);
              } else if (type === "hash") {
                hashSearch(string, keys, result, next);
              } else if (type === "list") {
                listSearch(string, keys, result, next);
              } else if (type === "set") {
                setSearch(string, keys, result, next);
              } else if (type === "zset") {
                sortedSetSearch(string, keys, result, next);
              } else {
                next(new Error("No handlers for strings of type: " + type));
              }
            },
            callback
          );
        }
      );
    },
    function (err) {
      if (err) return callback(err);
      callback(null, result);
    }
  );
}

function stringSearch(string, keys, result, callback) {
  async.each(
    keys,
    function (key, next) {
      client.get(key, function (err, value) {
        if (err) return next(err);
        if (!value) return next();
        if (value.indexOf(string) === -1) return next();

        result.push({ key: key, type: "STRING", value: value });
        next();
      });
    },
    callback
  );
}

function listSearch(string, keys, result, callback) {
  async.each(
    keys,
    function (key, next) {
      client.lrange(key, 0, -1, function (err, items) {
        if (err) return next(err);

        if (!items) return next();

        items.forEach(function (item) {
          if (item.indexOf(string) > -1)
            result.push({ key: key, type: "LIST", value: item });
        });

        next();
      });
    },
    callback
  );
}

function hashSearch(string, keys, result, callback) {
  async.each(
    keys,
    function (key, next) {
      client.hgetall(key, function (err, res) {
        if (err) return next(err);
        if (!res) return next();

        for (var property in res)
          if (
            res[property].indexOf(string) > -1 ||
            property.indexOf(string) > -1
          )
            result.push({
              key: key,
              type: "HASH",
              value: property + " " + res[property],
            });

        next();
      });
    },
    callback
  );
}

function setSearch(string, keys, result, callback) {
  async.each(
    keys,
    function (key, next) {
      client.smembers(key, function (err, members) {
        if (err) return next(err);
        if (!members) return next();

        members.forEach(function (member) {
          if (member.indexOf(string) > -1)
            result.push({ key: key, type: "SET", value: member });
        });

        next();
      });
    },
    callback
  );
}

function sortedSetSearch(string, keys, result, callback) {
  async.each(
    keys,
    function (key, next) {
      client.zrange(key, 0, -1, function (err, members) {
        if (err) return next(err);
        if (!members) return next();

        members.forEach(function (member) {
          if (member.indexOf(string) > -1)
            result.push({ key: key, type: "ZSET", value: member });
        });

        next();
      });
    },
    callback
  );
}

function redisKeys(pattern, fn, callback) {
  (async function () {
    for await (const keys of client.scanIterator({ MATCH: pattern, COUNT: 1000 })) {
      await new Promise((resolve, reject) => {
        fn(keys, function (err) {
          if (err) return reject(err);
          resolve();
        });
      });
    }
  })().then(
    function () {
      callback();
    },
    callback
  );
}

module.exports = main;
