var getView = require("./getView");
var ensure = require("helper/ensure");
var extend = require("helper/extend");
var getPartials = require("./getPartials");
var mime = require("mime-types");

// This method is used to retrieve the locals,
// partials and missing locals for a given view.
module.exports = function getFullView(blogID, templateID, viewName, callback) {
  ensure(blogID, "string")
    .and(templateID, "string")
    .and(viewName, "string")
    .and(callback, "function");

  getView(templateID, viewName, function (err, view) {
    if (err || !view) return callback(err);

    // View has:

    // - content (string) of the template view
    // - retrieve (object) locals embedded in the view
    //                     which need to be fetched.
    // - partials (object) partials in view

    getPartials(blogID, templateID, view.partials, function (
      err,
      allPartials,
      retrieveFromPartials
    ) {
      if (err) return callback(err);

      // allPartials (object) viewname : viewcontent

      // Now we've fetched the partials we need to
      // append the missing locals in the partials...
      // Handle cdn arrays specially - merge arrays instead of overwriting
      view.retrieve = view.retrieve || {};
      retrieveFromPartials = retrieveFromPartials || {};
      
      // Merge retrieve, handling cdn arrays specially
      for (var key in retrieveFromPartials) {
        if (key === 'cdn' && Array.isArray(retrieveFromPartials[key])) {
          // Merge cdn arrays - union of arrays
          if (!view.retrieve.cdn || !Array.isArray(view.retrieve.cdn)) {
            view.retrieve.cdn = [];
          }
          // Union of arrays - combine and deduplicate
          var combined = view.retrieve.cdn.concat(retrieveFromPartials.cdn);
          view.retrieve.cdn = [...new Set(combined)].sort();
        } else {
          // For other retrieve keys, use extend's soft merge
          if (view.retrieve[key] === undefined) {
            view.retrieve[key] = retrieveFromPartials[key];
          }
        }
      }

      var response = [
        view.locals,
        allPartials,
        view.retrieve,
        view.type || mime.lookup(view.name) || "text/html",
        view.content,
      ];

      return callback(null, response);
    });
  });
};
