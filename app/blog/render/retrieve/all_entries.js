var Entries = require("models/entries");
var projectEntryFields = require("./helpers/projectEntryFields");
var entryFieldList = require("./helpers/entryFieldList");

module.exports = function (req, res, callback) {
  var keys = ["allEntries", "all_entries"];
  var fields = entryFieldList(req.retrieve, keys);

  var done = function (allEntries) {
    return callback(null, projectEntryFields(allEntries, req.retrieve, keys));
  };

  // Only pass the options object when there is actually something to narrow,
  // so the plain two-arg call (and its test doubles) is unchanged otherwise.
  if (fields) {
    Entries.getAll(req.blog.id, { fields: fields }, done);
  } else {
    Entries.getAll(req.blog.id, done);
  }
};
