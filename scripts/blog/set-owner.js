var get = require("../get/blog");
var Blog = require("models/blog");
var User = require("models/user");

console.log("Switching blog", process.argv[2], "to user", process.argv[3]);
get(process.argv[2], function (err, user, blog) {
  if (err) throw err;

  User.getById(process.argv[3], function (err, newOwner) {
    newOwner.blogs.push(blog.id);

    User.set(newOwner.uid, { blogs: newOwner.blogs }, function (err) {
      Blog.set(blog.id, { owner: newOwner.uid }, function (err) {
        if (err) throw err;

        console.log("Stored", newOwner.uid, "as owner of", blog.id);
      });
    });
  });
});
