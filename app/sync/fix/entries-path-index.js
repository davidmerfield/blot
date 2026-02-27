const client = require("models/client");
const pathIndex = require("models/entries/pathIndex");

module.exports = function entriesPathIndex(blog, callback) {
  const entriesKey = "blog:" + blog.id + ":entries";
  const lexKey = pathIndex.lexKey(blog.id);

  Promise.all([client.zcard(entriesKey), client.zcard(lexKey)])
    .then(function ([entriesCountResult, lexCountResult]) {
      const entriesCount = parseInt(entriesCountResult, 10) || 0;
      const lexCount = parseInt(lexCountResult, 10) || 0;

      if (entriesCount === lexCount) return callback(null, []);

      pathIndex.backfillIndex(blog.id, function (err, rebuiltCount) {
        if (err) return callback(err);

        callback(null, [
          ["MISMATCH", { entries: entriesCount, pathIndex: lexCount }],
          ["BACKFILLED", rebuiltCount],
        ]);
      });
    })
    .catch(callback);
};
