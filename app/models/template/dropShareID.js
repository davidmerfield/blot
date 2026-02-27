var key = require("./key");
var client = require("models/client-new");
var getByShareID = require("./getByShareID");
var setMetadata = require("./setMetadata");

module.exports = function dropShareID(shareID, callback) {
  getByShareID(shareID, function (err, template) {
    if (err) return callback(err);

    template.shareID = "";
    setMetadata(template.id, template, function (setErr) {
      if (setErr) return callback(setErr);

      client
        .del(key.share(shareID))
        .then(function () {
          callback();
        })
        .catch(callback);
    });
  });
};
