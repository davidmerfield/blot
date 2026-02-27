var key = require("./key");
var client = require("models/client-new");

module.exports = function isOwner(owner, id, callback) {
  client
    .sIsMember(key.blogTemplates(owner), id)
    .then(function (isMember) {
      callback(null, !!isMember);
    })
    .catch(callback);
};
