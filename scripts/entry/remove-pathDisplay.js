var Entry = require("models/entry");
var eachEntry = require("../each/entry");
var colors = require("colors/safe");

eachEntry(
  function (user, blog, entry, next) {
    if (!entry.pathDisplay) return next();

    console.log(
      colors.dim(blog.id + " " + entry.guid),
      "removing pathDisplay",
      entry.path
    );

    delete entry.pathDisplay;

    Entry.set(blog.id, entry.id, entry, function (err) {
      if (err) throw err;
      next();
    });
  },
  function (err) {
    if (err) throw err;
    console.log("All entries processed");
    process.exit();
  }
);
