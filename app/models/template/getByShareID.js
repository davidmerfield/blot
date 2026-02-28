var key = require("./key");
var client = require("models/client");
var getMetadata = require("./getMetadata");

module.exports = function getByShareID(shareID, callback) {
  client
    .get(key.share(shareID))
    .then(function (id) {
      if (!id) {
        return callback(new Error("No template with shareID: " + shareID));
      }

      getMetadata(id, callback);
    })
    .catch(callback);
};
