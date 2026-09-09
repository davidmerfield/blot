var Entries = require("models/entries");
var projectEntryFields = require("./helpers/projectEntryFields");
var entryFieldList = require("./helpers/entryFieldList");

module.exports = function (req, res, callback) {
  var keys = ["recentEntries", "recent_entries"];
  var fields = entryFieldList(req.retrieve, keys);

  var done = function (recentEntries) {
    return callback(null, projectEntryFields(recentEntries, req.retrieve, keys));
  };

  if (fields) {
    Entries.getRecent(req.blog.id, { fields: fields }, done);
  } else {
    Entries.getRecent(req.blog.id, done);
  }
};
