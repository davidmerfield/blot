var Blog = require("models/blog");
var getConfirmation = require("../util/getConfirmation");

// We don't use get() since it throws an error if the user does not
// exist and sometimes with want to be able to clean up blogs
Blog.get({ handle: process.argv[2] }, function (err, blogFromHandle) {
  Blog.get({ domain: process.argv[2] }, function (err, blogFromDomain) {
    Blog.get({ id: process.argv[2] }, function (err, blogFromID) {
      var blog = blogFromID || blogFromHandle || blogFromDomain;

      if (!blog || !blog.id) throw new Error("No blog: " + process.argv[2]);

      getConfirmation(
        "Delete " + blog.id + " " + blog.handle + "? (y/N)",
        function (err, ok) {
          if (!ok) throw new Error("Not ok!");

          Blog.remove(blog.id, function (err) {
            if (err) throw err;
            console.log("Deleted", blog.id, blog.handle);
            process.exit();
          });
        }
      );
    });
  });
});
