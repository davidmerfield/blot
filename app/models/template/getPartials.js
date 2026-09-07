var getView = require("./getView");
var async = require("async");
var ensure = require("helper/ensure");
var promisify = require("util").promisify;
var parseTemplate = require("./parseTemplate");
var mergeRetrieve = require("./util/mergeRetrieve");

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

  // Partials whose content was supplied inline by the caller. These skip the
  // getView fetch below, so their field usage has to be collected here too.
  var inlinePartialContent = {};

  for (var i in partials) {
    if (partials[i]) {
      allPartials[i] = partials[i];
      inlinePartialContent[i] = partials[i];
    }
  }

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

  // A boolean retrieve value means "fields unknown here" - mergeRetrieve and
  // projectEntryFields both treat it as a projection blocker.
  function contextRootBlocker(contextPath) {
    var blocker = {};
    var root = String(contextPath || "").split(".")[0];
    if (root) blocker[root] = true;
    return blocker;
  }

  function parseRetrieveInContext(content, contextPath) {
    content = content || "";

    // A partial that switches Mustache delimiters ({{=<% %>=}}) can't be
    // wrapped in default-delimiter section tags - the synthetic closing tag
    // is no longer recognised and the section never closes. Under-reporting
    // its fields would let the parent projection drop one it renders, so
    // block projection for this context's entry local instead.
    if (contextPath && content.indexOf("{{=") > -1) {
      return contextRootBlocker(contextPath);
    }

    return parseTemplate(wrapInContext(content, contextPath)).retrieve || {};
  }

  function absorbInlinePartial(partial, inheritedContexts) {
    var content = inlinePartialContent[partial] || "";

    (inheritedContexts || [""]).forEach(function (contextPath) {
      if (!contextPath) {
        mergeRetrieve(retrieve, parseTemplate(content).retrieve || {});
        return;
      }

      mergeRetrieve(retrieve, parseRetrieveInContext(content, contextPath));

      // Nested partials inside inline content can't be reliably followed
      // through every usage context here, so don't let the parent project
      // this entry local when the inline partial pulls in others.
      if (content.indexOf("{{>") > -1) {
        mergeRetrieve(retrieve, contextRootBlocker(contextPath));
      }
    });
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
        var nextCalled = false;
        var finish = function () {
          if (nextCalled) return;
          nextCalled = true;
          next();
        };
        var inheritedContexts =
          contextMap[partial] && contextMap[partial].length
            ? contextMap[partial]
            : [""];

        // Don't fetch a partial if we've got it already.
        // Partials which returned nothing are set as
        // empty strings to prevent any infinities.
        if (allPartials[partial] !== null && allPartials[partial] !== undefined) {
          if (inlinePartialContent[partial] !== undefined) {
            absorbInlinePartial(partial, inheritedContexts);
          }
          return finish();
        }

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
              return finish();
            }

            // Only allow access to entries which exist and are public
            if (!entry.deleted && !entry.draft && !entry.scheduled) {
              allPartials[partial] = entry.html;
            }

            finish();
          });
          return;
        }

        // If the partial's name doesn't start with a slash,
        // it is the name of a tempalte view.
        if (partial.charAt(0) !== "/") {
          getView(templateID, partial, function (err, view) {
            if (view) {
              allPartials[partial] = view.content;

              inheritedContexts.forEach(function (contextPath) {
                if (!contextPath) {
                  mergeRetrieve(retrieve, view.retrieve || {});
                } else {
                  mergeRetrieve(
                    retrieve,
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

              fetchList(view.partials, finish);
            } else {
              allPartials[partial] = "";
              finish();
            }
          });
          return;
        }

        finish();
      },
      done
    );
  }
};
