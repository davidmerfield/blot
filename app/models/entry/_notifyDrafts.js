var ensure = require("helper/ensure");
var redis = require("models/client");
var model = require("./model");

module.exports = function (blogID, entry, callback) {
  ensure(blogID, "string").and(entry, model).and(callback, "function");

  if (!entry.draft) return callback();

  var channel = "blog:" + blogID + ":draft:" + entry.path;

  // Now the entry has been updated,
  // tell the server to send a SSE event
  // to any browsers viewing the preview

  // for this entry and refresh the IFRAME

  redis.publish(channel, Date.now().toString(), callback);
};
