var Tags = require("models/tags");
var Entry = require("models/entry");
var async = require("async");

module.exports = function (req, res, callback) {
  req.log("Listing all tags");
  Tags.list(req.blog.id, function (err, tags) {
    // In future, we might want to expose
    // other options for this sorting...
    req.log("Sorting all tags");
    tags = tags.sort(function (a, b) {
      var nameA = a.name.toLowerCase();
      var nameB = b.name.toLowerCase();

      if (nameA < nameB) return -1;

      if (nameA > nameB) return 1;

      return 0;
    });

    req.log("Counting all tags");
    tags = tags.map((tag) => {
      tag.tag = tag.name;
      tag.total = tag.entries.length;
      if (tag.slug) tag.slug = encodeURIComponent(tag.slug);
      return tag;
    });

    req.log("Listed all tags");
    callback(null, tags);
  });
};
