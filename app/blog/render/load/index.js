var ensure = require("helper/ensure");
var augment = require("./augment");
var eachEntry = require("./eachEntry");

// then we check each entry in the view

// we determine a new list of partials
// and locals to retrieve based on those entries

// and retrieve them
// merging them into the view

// then returning req and res

module.exports = function (req, res, callback) {
  ensure(req, "object").and(res, "object").and(callback, "function");

  eachEntry(
    res.locals,
    function (entry, next) {
      augment(req, res, entry, next);
    },
    function (err) {
      callback(err, req, res);
    }
  );
};
