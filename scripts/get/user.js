var User = require("models/user");
var fromBlog = require("./blog");

// Takes a URL or handle and fetches the blog and user
module.exports = function get(identifier, callback) {
  let user;

  fromBlog(identifier, function (err, userFromBlog) {
    User.getById(identifier, function (err, userFromID) {
      User.getByCustomerId(identifier, function (err, userFromCustomerID) {
        User.getByEmail(identifier, function (err, userFromEmail) {
          if (
            !userFromBlog &&
            !userFromID &&
            !userFromCustomerID &&
            !userFromEmail
          )
            return callback(new Error("No user"));

          user =
            userFromBlog || userFromID || userFromCustomerID || userFromEmail;

          require("../blog/access")(user.email, function (err, url) {
            if (err) return callback(err);
            callback(err, user, url);
          });
        });
      });
    });
  });
};
