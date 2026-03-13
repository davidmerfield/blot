var key = require("./key");
var client = require("models/client");
var getMetadata = require("./getMetadata");
var setMetadata = require("./setMetadata");
var uuid = require("uuid/v4");

module.exports = function createShareID(templateID, callback) {
  getMetadata(templateID, function (err, template) {
    template.shareID = uuid();
    setMetadata(templateID, template, function (err) {
      if (err) return callback(err);
      client.set(key.share(template.shareID), templateID, function (err) {
        if (err) return callback(err);
        callback(null, template.shareID);
      });
    });
  });
};
