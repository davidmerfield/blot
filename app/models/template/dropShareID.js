var key = require("./key");
var client = require("models/client");
var getByShareID = require("./getByShareID");
var setMetadata = require("./setMetadata");

module.exports = function dropShareID(shareID, callback) {
  getByShareID(shareID, function (err, template) {
    if (err) return callback(err);
    template.shareID = "";
    setMetadata(template.id, template, function (err) {
      if (err) return callback(err);
      client.del(key.share(shareID), callback);
    });
  });
};
