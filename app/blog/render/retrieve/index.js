var _ = require("lodash");
var async = require("async");
var ensure = require("helper/ensure");
var dictionary = {
  "absoluteURLs": require("./absoluteURLs"),
  "active": require("./active"),
  "allEntries": require("./allEntries"),
  "allTags": require("./allTags"),
  "all_entries": require("./all_entries"),
  "all_tags": require("./all_tags"),
  "appCSS": require("./appCSS"),
  "appJS": require("./appJS"),
  "archives": require("./archives"),
  "asset": require("./asset"),
  "avatar_url": require("./avatar_url"),
  "cdn": require("./cdn"),
  "css_url": require("./css_url"),
  "folder": require("./folder"),
  "encodeJSON": require("./encodeJSON"),
  "encodeURIComponent": require("./encodeURIComponent"),
  "encodeXML": require("./encodeXML"),
  "feed_url": require("./feed_url"),
  "isActive": require("./isActive"),
  "is": require("./is"),
  "latestEntry": require("./latestEntry"),
  "page": require("./page"),
  "posts": require("./posts"),
  "plugin_css": require("./plugin_css"),
  "plugin_js": require("./plugin_js"),
  "plugin": require("./plugin"),
  "popular_tags": require("./popular_tags"),
  "public": require("./public"),
  "recentEntries": require("./recentEntries"),
  "recent_entries": require("./recent_entries"),
  "rgb": require("./rgb"),
  "script_url": require("./script_url"),
  "search_query": require("./search_query"),
  "search_results": require("./search_results"),
  "sort:date": require("./sort:date"),
  "sort:path": require("./sort:path"),
  "tagged": require("./tagged"),
  "total_posts": require("./total_posts"),
  "updated": require("./updated"),
};

module.exports = function (req, res, retrieve, callback) {
  ensure(req, "object").and(retrieve, "object").and(callback, "function");

  var locals = {};

  req.retrieve = retrieve;

  async.each(
    _.keys(retrieve),
    function (localName, nextLocal) {
      if (dictionary[localName] === undefined) {
        // console.log(req.blog.handle, req.blog.id, ": No retrieve method to look up", localName);
        return nextLocal();
      }

      req.log("Retrieving local", localName);
      dictionary[localName](req, res, function (err, value) {
        if (err) console.log(err);

        if (value !== undefined) locals[localName] = value;

        req.log("Retrieved local", localName);
        return nextLocal();
      });
    },
    function () {
      req.log("Retrieved all locals");
      callback(null, locals);
    }
  );
};
