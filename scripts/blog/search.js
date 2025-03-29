var Entry = require("entry");
var reds = require("reds");
var get = require("../get/blog");

get(process.argv[2], function (err, user, blog) {
  if (err) throw err;
  var string = process.argv[3];
  var search = reds.createSearch("blog:" + blog.id + ":search");

  search.query(string).end(function (err, ids) {
    console.log(ids);
    Entry.get(blog.id, ids, function (entries) {
      console.log("found", entries.length, "entries");
    });
  });
});
