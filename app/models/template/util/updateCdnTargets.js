const async = require("async");
const client = require("models/client");
const key = require("../key");

function uniqueList(values) {
  if (!Array.isArray(values)) return [];
  const set = new Set();
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      set.add(value);
    }
  }
  return Array.from(set);
}

module.exports = function updateCdnTargets(templateID, previous, next, callback) {
  const cdnKey = key.cdnTargets(templateID);
  const previousList = uniqueList(previous);
  const nextList = uniqueList(next);

  const previousSet = new Set(previousList);
  const nextSet = new Set(nextList);

  const toAdd = nextList.filter((target) => !previousSet.has(target));
  const toRemove = previousList.filter((target) => !nextSet.has(target));

  async.eachSeries(
    toAdd,
    function (target, nextFn) {
      client.hincrby(cdnKey, target, 1, nextFn);
    },
    function (err) {
      if (err) return callback(err);

      async.eachSeries(
        toRemove,
        function (target, nextFn) {
          client.hincrby(cdnKey, target, -1, function (error, count) {
            if (error) return nextFn(error);
            if (count > 0) return nextFn();
            client.hdel(cdnKey, target, nextFn);
          });
        },
        callback
      );
    }
  );
};
