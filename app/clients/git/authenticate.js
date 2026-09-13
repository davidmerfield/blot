var auth = require("http-auth");
var Blog = require("models/blog");
var User = require("models/user");
var database = require("./database");

module.exports = auth.connect(
  // Beware that req as fourth argument might not be reliable:
  // https://github.com/http-auth/http-auth/pull/67#issuecomment-244306701
  auth.basic({ realm: "Git" }, function (email, token, callback, req) {
    
    User.getByEmail(email, function (err, user) {
      // There is no user with this email address
      if (err || !user) {
        return callback(false);
      }

      database.checkToken(user.uid, token, function (err, valid) {
        // The token is bad
        if (err || !valid) {
          return callback(false);
        }

        // User is attempting to push or pull another user's repo
        Blog.get({ handle: req.gitHandle }, function (err, blog) {
          // There is no blog with this handle
          if (err || !blog || blog.handle !== req.gitHandle) {
            return callback(false);
          }

          // The account associated with this email does not have permission
          // to modify this blog.
          if (blog.owner !== user.uid) {
            return callback(false);
          }

          req.blog = blog;
          callback(true);
        });
      });
    });
  })
);
