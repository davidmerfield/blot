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
  "css_url": require("./css_url"),
  "folder": require("./folder"),
  "encodeJSON": require("./encodeJSON"),
  "encodeURIComponent": require("./encodeURIComponent"),
  "encodeXML": require("./encodeXML"),
  "cdn": require("./cdn"),
  "feed_url": require("./feed_url"),
  "isActive": require("./isActive"),
  "is": require("./is"),
  "latestEntry": require("./latestEntry"),
  "page": require("./page"),
  "posts": require("./posts"),
  "plugin_css": require("./plugin_css"),
  "plugin_js": require("./plugin_js"),
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

// Extract root variable names from nested retrieve structure
// Only extracts top-level keys - nested properties are informational only
function extractRootVariables(retrieve) {
  var rootVars = new Set();
  
  for (var key in retrieve) {
    var value = retrieve[key];
    
    // Special case: 'cdn' is an array, not a nested object
    if (key === "cdn" && Array.isArray(value)) {
      rootVars.add(key);
      continue;
    }
    
    // If value is an object (and not an array), the key is a root variable
    // The nested structure just shows which properties are accessed
    if (value && typeof value === "object" && !Array.isArray(value)) {
      // This is a nested structure - the key itself is a root variable
      rootVars.add(key);
      // Don't recursively traverse - nested keys are just property names, not root variables
    } else if (value !== false && value !== null && value !== undefined) {
      // Boolean or other truthy value - this is a root variable
      rootVars.add(key);
    }
  }
  
  return rootVars;
}

module.exports = function (req, res, retrieve, callback) {
  ensure(req, "object").and(retrieve, "object").and(callback, "function");

  var locals = {};

  // Extract all root variables from nested retrieve structure
  var rootVariables = Array.from(extractRootVariables(retrieve));

  async.each(
    rootVariables,
    function (localName, nextLocal) {
      if (dictionary[localName] === undefined) {
        // console.log(req.blog.handle, req.blog.id, ": No retrieve method to look up", localName);
        return nextLocal();
      }

      // Get the value - could be boolean, array, object, etc.
      // This supports future parameter passing to retrieve functions
      var params = retrieve[localName];
      
      // Skip if explicitly false, null, or undefined
      // For arrays/objects, truthy check will pass (they should be retrieved)
      if (params === false || params === null || params === undefined) {
        return nextLocal();
      }

      req.log("Retrieving local", localName);
      
      // For now, all retrieve functions have signature (req, res, callback)
      // Params (arrays/objects) are stored but not yet passed to functions
      // When functions are updated to accept params, they can use the signature:
      // function(req, res, params, callback) and we can pass params here
      // For now, params are available in retrieve[localName] if functions need them
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
