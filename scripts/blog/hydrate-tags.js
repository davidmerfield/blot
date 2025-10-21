const get = require("../get/blog");
const removeLegacyTagSetKeys = require("../db/remove-legacy-tag-set-keys");

console.log("Remove legacy tag set data for Blot blogs.");
console.log("Pass a blog handle, domain, or ID to target a single blog.");
console.log("Run without arguments to process every blog (confirmation required).");

const identifier = process.argv[2];

if (identifier) {
  get(identifier, function (err, user, blog) {
    if (err || !blog) {
      console.error("Could not resolve blog from identifier", identifier);
      if (err) console.error(err);
      process.exit(1);
      return;
    }

    removeLegacyTagSetKeys(blog.id)
      .then(function () {
        console.log(
          "Removed legacy tag set keys for",
          blog.id,
          blog.handle || ""
        );
        process.exit(0);
      })
      .catch(function (error) {
        console.error(
          "Failed to remove legacy tag set keys for",
          blog.id,
          blog.handle || ""
        );
        console.error(error);
        process.exit(1);
      });
  });
} else {
  removeLegacyTagSetKeys()
    .then(function () {
      console.log("Finished removing legacy tag set keys.");
      process.exit(0);
    })
    .catch(function (error) {
      console.error("Failed to remove legacy tag set keys.");
      console.error(error);
      process.exit(1);
    });
}
