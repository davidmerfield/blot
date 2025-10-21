var async = require("async");
var customerID = process.argv[2];
var User = require("models/user");

User.getAllIds(function (err, uids) {
  if (err) throw err;
  async.each(
    uids,
    function (uid, next) {
      User.getById(uid, function (err, user) {
        if (
          user &&
          user.subscription &&
          user.subscription.customer === customerID
        ) {
          console.log("MATCH", user.email, user.blogs);
        }
        next();
      });
    },
    process.exit
  );
});
