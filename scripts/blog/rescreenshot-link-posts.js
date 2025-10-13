var get = require("../get/blog");
var sync = require("../../app/sync");
var Entries = require("models/entries");

if (!process.argv[2]) {
  console.log(
    "Please pass a blog identifier to this script. Blot will rebuild the blog which exists at that URL."
  );
  process.exit();
}

const main = async (blog, cb) => {
  if (!blog.plugins.linkScreenshot.enabled) {
    console.log("No linkScreenshot plugin enabled for", blog.handle);
    return cb();
  }

  console.log("Starting sync for", blog.handle);
  sync(blog.id, function (err, folder, done) {
    if (err) return cb(err);

    Entries.each(
      blog.id,
      function (entry, nextEntry) {
        if (!entry.id.endsWith(".webloc")) {
          console.log("Skipping", entry.id, "not a webloc file");
          return nextEntry();
        }

        if (entry.thumbnail.large) {
          console.log("Skipping", entry.id, "already has a thumbnail");
          return nextEntry();
        }

        console.log("Rebuilding", entry.id);
        folder.update(entry.id, function (err) {
          if (err) console.log(err);
          nextEntry();
        });
      },
      (err) => {
        if (err) return done(err, cb);
        done(null, cb);
      }
    );
  });
};

if (require.main === module) {
  get(process.argv[2], function (err, user, blog) {
    if (err) throw err;
    main(blog, function (err) {
      if (err) throw err;
      console.log("Done!");
      process.exit();
    });
  });
}
