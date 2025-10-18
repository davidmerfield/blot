const get = require("../get/blog");
const each = require("../each/blog");
const getConfirmation = require("../util/getConfirmation");
const hydrate = require("models/tags/_hydrate");

console.log("Hydrate tag sorted sets for Blot blogs.");
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

    hydrate(blog.id)
      .then(function () {
        console.log("Hydrated tag sorted sets for", blog.id, blog.handle || "");
        process.exit(0);
      })
      .catch(function (error) {
        console.error("Failed to hydrate tag sorted sets for", blog.id, blog.handle || "");
        console.error(error);
        process.exit(1);
      });
  });
} else {
  getConfirmation("Hydrate tag sorted sets for every blog?")
    .then(function (ok) {
      if (!ok) {
        console.log("No blogs were hydrated.");
        process.exit(0);
        return;
      }

      console.log("Hydrating tag sorted sets for every blog...");

      each(
        function (user, blog, next) {
          hydrate(blog.id)
            .then(function () {
              console.log("Hydrated tag sorted sets for", blog.id, blog.handle || "");
              next();
            })
            .catch(function (error) {
              console.error(
                "Failed to hydrate tag sorted sets for",
                blog.id,
                blog.handle || ""
              );
              console.error(error);
              next(error);
            });
        },
        function (err) {
          if (err) {
            console.error("Stopped hydrating tag sorted sets early due to an error.");
            console.error(err);
            process.exit(1);
            return;
          }

          console.log("Finished hydrating tag sorted sets for every blog.");
          process.exit(0);
        }
      );
    })
    .catch(function (error) {
      console.error("Failed to obtain confirmation.");
      console.error(error);
      process.exit(1);
    });
}
