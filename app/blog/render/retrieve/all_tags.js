var Tags = require("models/tags");
var Entry = require("models/entry");
var async = require("async");

module.exports = function (req, res, callback) {
  var path_prefix =
    res.locals.path_prefix ??
    (req.template && req.template.locals && req.template.locals.path_prefix);

  req.log("Listing all tags");
  Tags.list(req.blog.id, { path_prefix }, function (err, tags) {
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

    let set = {};

    req.log("Counting all tags");
    tags = tags.map((tag) => {
      tag.tag = tag.name;
      tag.total = tag.entries.length;
      tag.entries.forEach(id => {
        set[id] = true;
      });
      if (tag.slug) tag.slug = encodeURIComponent(tag.slug);
      return tag;
    });

    // toDO maybe rename this? it's ugly
    res.locals.all_tags_total_posts = Object.keys(set).length;

    req.log("Listed all tags");
    callback(null, tags);
  });
};
