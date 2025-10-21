var each = require("../each/blog");
var gitDatabase = require("clients/git/database");
var getConfirmation = require("../util/getConfirmation");

getConfirmation(
  "Do you want to reset the git token for all blogs? (y/n)",
  function (err, ok) {
    if (!ok) {
      return process.exit();
    }

    console.log("Resetting tokens...");
    each(function (user, blog, next) {
      if (blog.client !== "git") return next();
      gitDatabase.refreshToken(user.uid, function (err) {
        if (err) throw err;
        console.log("reset token for", blog.id, blog.handle);
        next();
      });
    }, process.exit);
  }
);
