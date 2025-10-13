const Entry = require("models/entry");
const Tags = require("models/tags");
const type = require("helper/type");
const _ = require("lodash");
const async = require("async");

module.exports = function (req, callback) {
  var blog = req.blog;
  var blogID = blog.id;

  var tags = req.query.name || req.query.tag || req.params.tag || "";

  if (type(tags, "array")) {
  } else if (type(tags, "string")) {
    tags = [tags];
  } else {
    return callback(new Error("Unexpected type of tag"));
  }

  async.mapSeries(
    tags,
    function (tag, next) {
      Tags.get(blogID, tag, next);
    },
    function (err, allEntryIDs) {
      let entryIDs = _.intersection.apply(null, allEntryIDs);

      Entry.get(blogID, entryIDs, function (err, entries) {
        if (err) return callback(err);
        entries.sort(function (a, b) {
          return b.dateStamp - a.dateStamp;
        });

        const tag = tags.join(" + ");
        const tagged = {};

        tagged[tag] = true;
        tagged[tag.toLowerCase()] = true;

        return callback(null, {
          tag,
          tagged,
          is: tagged, // alias
          entries
        });
      });
    }
  );
};
