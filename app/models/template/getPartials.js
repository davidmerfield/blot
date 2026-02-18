var getView = require("./getView");
var async = require("async");
var ensure = require("helper/ensure");
var extend = require("helper/extend");
var promisify = require("util").promisify;
var parseTemplate = require("./parseTemplate");

module.exports = function getPartials(
  blogID,
  templateID,
  partials,
  callback,
  contextMap,
  parentContextPath
) {
  try {
    ensure(blogID, "string")
      .and(templateID, "string")
      .and(partials, "object")
      .and(callback, "function");

    if (!contextMap) contextMap = {};
    if (!parentContextPath) parentContextPath = "";
  } catch (e) {
    return callback(e);
  }

  var Entry = require("../entry");
  var allPartials = {};
  var retrieve = {};
  var getEntry = promisify((blogID, partial, cb) => Entry.get(blogID, partial, function(entry){
    cb(null, entry);
  }));

  for (var i in partials) if (partials[i]) allPartials[i] = partials[i];

  Object.keys(partials || {}).forEach(function (partialName) {
    // Keep any previously-discovered usage contexts for this partial.
    // Falling back to the parent context should only happen when no
    // context has been recorded yet.
    if (!contextMap[partialName] || !contextMap[partialName].length) {
      addContext(partialName, parentContextPath || "");
    }
  });

  function addContext(partialName, contextPath) {
    if (!contextMap[partialName]) contextMap[partialName] = [];
    if (contextMap[partialName].indexOf(contextPath) === -1) {
      contextMap[partialName].push(contextPath);
    }
  }


  function wrapInContext(content, contextPath) {
    if (!contextPath) return content || "";

    var segments = contextPath.split(".").filter(Boolean);
    var wrapped = content || "";

    for (var i = segments.length - 1; i >= 0; i--) {
      wrapped = "{{#" + segments[i] + "}}" + wrapped + "{{/" + segments[i] + "}}";
    }

    return wrapped;
  }

  function parseRetrieveInContext(content, contextPath) {
    return parseTemplate(wrapInContext(content, contextPath)).retrieve || {};
  }

  function mergePartialContexts(viewContent, inheritedContexts) {
    var merged = {};

    (inheritedContexts || [""]).forEach(function (contextPath) {
      var partialContexts = parseTemplate.getPartialContexts(viewContent || "", contextPath);

      Object.keys(partialContexts).forEach(function (partialName) {
        if (!merged[partialName]) merged[partialName] = [];

        partialContexts[partialName].forEach(function (path) {
          if (merged[partialName].indexOf(path) === -1) {
            merged[partialName].push(path);
          }
        });
      });
    });

    return merged;
  }

  fetchList(partials, function () {
    return callback(null, allPartials, retrieve);
  });

  function fetchList(partials, done) {
    async.eachOfSeries(
      partials,
      function (value, partial, next) {
        var inheritedContexts =
          contextMap[partial] && contextMap[partial].length
            ? contextMap[partial]
            : [""];
        // Don't fetch a partial if we've got it already.
        // Partials which returned nothing are set as
        // empty strings to prevent any infinities.
        if (allPartials[partial] !== null && allPartials[partial] !== undefined)
          return next();

        // If the partial's name starts with a slash,
        // it is a path to an entry.
        if (partial.charAt(0) === "/") {
          Entry.get(blogID, partial, async function (entry) {
            // empty string and not undefined to
            // prevent infinite fetches
            allPartials[partial] = "";

            // try lower case
            if (!entry || !entry.html) {
              entry = await getEntry(blogID, partial.toLowerCase());
            }

            if (!entry || !entry.html) {
              return next();
            }

            // Only allow access to entries which exist and are public
            if (!entry.deleted && !entry.draft && !entry.scheduled) {
              allPartials[partial] = entry.html;

              inheritedContexts.forEach(function (contextPath) {
                extend(retrieve).and(parseRetrieveInContext(entry.html || "", contextPath));
              });
            }

            next();
          });
        }

        // If the partial's name doesn't start with a slash,
        // it is the name of a tempalte view.
        if (partial.charAt(0) !== "/") {
          getView(templateID, partial, function (err, view) {
            if (view) {
              allPartials[partial] = view.content;

              inheritedContexts.forEach(function (contextPath) {
                if (!contextPath) {
                  extend(retrieve).and(view.retrieve || {});
                } else {
                  extend(retrieve).and(
                    parseRetrieveInContext(view.content || "", contextPath)
                  );
                }
              });

              var nestedPartials = mergePartialContexts(
                view.content,
                inheritedContexts
              );

              Object.keys(nestedPartials).forEach(function (nestedPartial) {
                nestedPartials[nestedPartial].forEach(function (nestedContextPath) {
                  addContext(nestedPartial, nestedContextPath);
                });
              });

              fetchList(view.partials, next);
            } else {
              allPartials[partial] = "";
              next();
            }
          });
        }
      },
      done
    );
  }
};
