var Entries = require("models/entries");
var projectEntryFields = require("./helpers/projectEntryFields");
var entryFieldList = require("./helpers/entryFieldList");

module.exports = function (req, res, callback) {
  var keys = ["allEntries", "all_entries"];
  var fields = entryFieldList(req.retrieve, keys);

  Entries.getAll(req.blog.id, { fields: fields }, function (allEntries) {
    return callback(
      null,
      projectEntryFields(allEntries, req.retrieve, keys)
    );
  });
};
