var client = require("models/client");
var key = require("./key");
var async = require("async");
var getMetadata = require("./getMetadata");
var ensure = require("helper/ensure");

// The list of possible template choices
// for a given blog. Accepts a UID and
// returns an array of template metadata
// objects. Does not contain any view info
module.exports = function getTemplateList(blogID, callback) {
  ensure(blogID, "string").and(callback, "function");

  client.smembers(key.blogTemplates('SITE'), function (err, publicTemplates) {
    client.smembers(key.blogTemplates(blogID), function (err, blogTemplates) {
      var templateIDs = publicTemplates.concat(blogTemplates);
      var response = [];

      async.eachSeries(
        templateIDs,
        function (id, next) {
          getMetadata(id, function (err, info) {
            if (err) return next();

            if (info) response.push(info);

            next();
          });
        },
        function () {
          callback(err, response);
        }
      );
    });
  });
};
