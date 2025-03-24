var get = require("../get/blog");
var Blog = require("models/blog");
var User = require("models/user");

console.log("Switching blog", process.argv[2], "to domain", process.argv[3]);

if (!process.argv[3]) {
  console.log("Usage: node scripts/blog/set-domain.js <blogID> <domain>");
  process.exit(1);
}

get(process.argv[2], function (err, user, blog) {
  if (err) throw err;

      Blog.set(blog.id, { domain: process.argv[3] }, function (err) {
        if (err) throw err;

        console.log("Set domain", process.argv[3], "for", blog.id);
      });
    });
