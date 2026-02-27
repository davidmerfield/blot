var redis = require("models/redis");
var client = new redis();

function main(string, callback) {
  var types = {};
  var result = [];

  (async function () {
    await redisKeys("*", async function (keys) {
      for (const key of keys) {
        if (key.indexOf(string) > -1)
          result.push({ key: key, value: "KEY ITSELF", type: "KEY" });

        const type = await client.type(key);

        types[type] = types[type] || [];
        types[type].push(key);
      }

      for (const type in types) {
        const keysByType = types[type];

        if (type === "string") {
          await stringSearch(string, keysByType, result);
        } else if (type === "hash") {
          await hashSearch(string, keysByType, result);
        } else if (type === "list") {
          await listSearch(string, keysByType, result);
        } else if (type === "set") {
          await setSearch(string, keysByType, result);
        } else if (type === "zset") {
          await sortedSetSearch(string, keysByType, result);
        } else {
          throw new Error("No handlers for strings of type: " + type);
        }
      }
    });

    callback(null, result);
  })().catch(callback);
}

async function stringSearch(string, keys, result) {
  for (const key of keys) {
    const value = await client.get(key);

    if (!value) continue;
    if (value.indexOf(string) === -1) continue;

    result.push({ key: key, type: "STRING", value: value });
  }
}

async function listSearch(string, keys, result) {
  for (const key of keys) {
    const items = await client.lrange(key, 0, -1);
    if (!items) continue;

    items.forEach(function (item) {
      if (item.indexOf(string) > -1)
        result.push({ key: key, type: "LIST", value: item });
    });
  }
}

async function hashSearch(string, keys, result) {
  for (const key of keys) {
    const res = await client.hgetall(key);
    if (!res) continue;

    for (var property in res)
      if (res[property].indexOf(string) > -1 || property.indexOf(string) > -1)
        result.push({
          key: key,
          type: "HASH",
          value: property + " " + res[property],
        });
  }
}

async function setSearch(string, keys, result) {
  for (const key of keys) {
    const members = await client.smembers(key);
    if (!members) continue;

    members.forEach(function (member) {
      if (member.indexOf(string) > -1)
        result.push({ key: key, type: "SET", value: member });
    });
  }
}

<<<<<<< codex/find-and-replace-lowercase-sorted-set-commands
function sortedSetSearch(string, keys, result, callback) {
  async.each(
    keys,
    function (key, next) {
      client.ZRANGE(key, 0, -1, function (err, members) {
        if (err) return next(err);
        if (!members) return next();

        members.forEach(function (member) {
          if (member.indexOf(string) > -1)
            result.push({ key: key, type: "ZSET", value: member });
        });
=======
async function sortedSetSearch(string, keys, result) {
  for (const key of keys) {
    const members = await client.zrange(key, 0, -1);
    if (!members) continue;
>>>>>>> update-redis

    members.forEach(function (member) {
      if (member.indexOf(string) > -1)
        result.push({ key: key, type: "ZSET", value: member });
    });
  }
}

async function redisKeys(pattern, fn) {
  var complete;
  var cursor = "0";

  while (!complete) {
    const res = await client.scan(cursor, "match", pattern, "count", 1000);

    cursor = res[0];
    await fn(res[1]);

    complete = cursor === "0";
  }
}

module.exports = main;
