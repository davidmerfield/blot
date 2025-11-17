var async = require("async");

// This makes it easy to iterate over a
// cheerio element collection and perform
// some asynchronous task, a la forEach.

module.exports = function ($, tag, doThis, callback) {
  // Eventually I'd like to make this parallel
  // when forEach can handle paralell execution
  // for objects...
  async.eachOfLimit(
    $(tag),
    1,
    function (el, i, next) {
      // The cheerio object contains other
      if (!el || el.name !== tag) return next();

      doThis(el, next);
    },
    callback
  );
};
