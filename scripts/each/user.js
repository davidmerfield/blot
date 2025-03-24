var User = require("models/user");
var async = require("async");

module.exports = function (fn, callback) {
  User.getAllIds(function (err, uids) {
    if (err || !uids) return callback(err || new Error("No uids"));

    async.eachSeries(
      uids,
      function (uid, next) {
        User.getById(uid, function (err, user) {
          if (err || !user) return next(err || new Error("No user"));

          fn(user, next);
        });
      },
      callback
    );
  });
};
