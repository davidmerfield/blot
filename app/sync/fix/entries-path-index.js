const client = require("models/client");
const pathIndex = require("models/entries/pathIndex");

module.exports = function entriesPathIndex(blog, callback) {
  const entriesKey = "blog:" + blog.id + ":entries";
  const lexKey = pathIndex.lexKey(blog.id);

  client.batch().zcard(entriesKey).zcard(lexKey).exec(function (err, res) {
    if (err) return callback(err);

    const entriesCount = parseInt(res[0], 10) || 0;
    const lexCount = parseInt(res[1], 10) || 0;

    if (entriesCount === lexCount) return callback(null, []);

    pathIndex.backfillIndex(blog.id, function (err, rebuiltCount) {
      if (err) return callback(err);

      callback(null, [
        ["MISMATCH", { entries: entriesCount, pathIndex: lexCount }],
        ["BACKFILLED", rebuiltCount],
      ]);
    });
  });
};
