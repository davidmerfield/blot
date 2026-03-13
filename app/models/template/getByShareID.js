var key = require("./key");
var client = require("models/client");
var getMetadata = require("./getMetadata");

module.exports = function getByShareID(shareID, callback) {
  client.get(key.share(shareID), function (err, id) {
    if (err || !id)
      return callback(err || new Error("No template with shareID: " + shareID));
      
    getMetadata(id, callback);
  });
};
