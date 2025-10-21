const async = require("async");
const type = require("helper/type");
const CheckEntry = require("./checkEntry");
const sync = require("sync");
const fs = require("fs-extra");
const { join } = require("path");

module.exports = function SyncAndCheck(blogID) {
  return (files, entries, callback) => {
    if (type(files) === "object") files = [files];
    if (type(entries) === "object") entries = [entries];

    sync(blogID, (err, folder, syncDone) => {
      if (err) return callback(err);

      async.eachSeries(
        files,
        ({ path, content }, next) => {
          fs.outputFileSync(join(folder.path, path), content, "utf-8");
          folder.update(path, next);
        },
        (err) => {
          if (err) return syncDone(err, callback);
          async.eachSeries(entries, CheckEntry(blogID), (err) => {
            syncDone(err, callback);
          });
        }
      );
    });
  };
};
