var Mustache = require("mustache");
var type = require("helper/type");
var client = require("models/client");
var key = require("./key");
var urlNormalizer = require("helper/urlNormalizer");
var ensure = require("helper/ensure");
var extend = require("helper/extend");
var viewModel = require("./viewModel");
var getView = require("./getView");
var serialize = require("./util/serialize");
var getMetadata = require("./getMetadata");
var Blog = require("models/blog");
var parseTemplate = require("./parseTemplate");
var ERROR = require("../../blog/render/error");
var updateCdnManifest = require("./util/updateCdnManifest");

module.exports = function setView(templateID, updates, callback) {
  ensure(templateID, "string").and(updates, "object").and(callback, "function");

  if (updates.partials !== undefined && type(updates.partials) !== "object") {
    updates.partials = {};
    console.log(templateID, updates, "Partials are wrong type");
  }

  var name = updates.name;

  if (!name || !type(name, "string")) {
    return callback(new Error("The view's name is invalid"));
  }

  // Validate that the name doesn't start with '.' or contain a slash
  if (name.startsWith('.')) {
    return callback(new Error("View names cannot start with '.'"));
  }

  // We don't support subdirectories in templates at the moment
  if (name.includes('/') || name.includes('\\')) {
    return callback(new Error("View names cannot contain slashes"));
  }

  if (updates.content !== undefined) {
    try {
      Mustache.render(updates.content, {});
    } catch (e) {
      return callback(e);
    }
  }

  var allViews = key.allViews(templateID);
  var viewKey = key.view(templateID, name);

  getMetadata(templateID, function (err, metadata) {
    if (err) return callback(err);

    if (!metadata)
      return callback(new Error("There is no template called " + templateID));

    client.sadd(allViews, name, function (err) {
      if (err) return callback(err);

      // Look up previous state of view if applicable
      getView(templateID, name, function (err, view) {
        view = view || {};

        var changes;

        // Handle `url` logic
        if (updates.url) {
          if (type(updates.url, "array")) {
            // If `url` is an array, use the first item as `url` and the array as `urlPatterns`
            const normalizedUrls = updates.url.map(urlNormalizer);
            updates.url = normalizedUrls[0];
            updates.urlPatterns = normalizedUrls;
          } else if (type(updates.url, "string")) {
            // If `url` is a string, normalize it and use `[url]` as `urlPatterns`
            updates.url = urlNormalizer(updates.url);
            updates.urlPatterns = [updates.url];
          } else {
            return callback(
              new Error("The provided `url` must be a string or an array")
            );
          }

          client.set(key.url(templateID, updates.url), name);

          if (updates.url !== view.url) {
            client.del(key.url(templateID, view.url));
          }
        }

        // SHORT-CIRCUIT: Check if content and other critical fields are unchanged
        // This avoids expensive operations (parsing, dependency detection, Redis writes, CDN updates)
        var contentUnchanged = updates.content === undefined || updates.content === view.content;
        var urlUnchanged = !updates.url || updates.url === view.url;
        var urlPatternsUnchanged = !updates.urlPatterns || 
          JSON.stringify(updates.urlPatterns) === JSON.stringify(view.urlPatterns);
        var localsUnchanged = !updates.locals || 
          JSON.stringify(updates.locals || {}) === JSON.stringify(view.locals || {});
        var partialsUnchanged = !updates.partials || 
          JSON.stringify(updates.partials || {}) === JSON.stringify(view.partials || {});
        var retrieveUnchanged = !updates.retrieve || 
          JSON.stringify(updates.retrieve || {}) === JSON.stringify(view.retrieve || {});

        if (contentUnchanged && urlUnchanged && urlPatternsUnchanged && 
            localsUnchanged && partialsUnchanged && retrieveUnchanged) {
          // Nothing has changed, skip all expensive operations
          return callback();
        }

        for (var i in updates) {
          if (updates[i] !== view[i]) changes = true;
          view[i] = updates[i];
        }

        ensure(view, viewModel);

        if (updates.urlPatterns) {
          // Store `urlPatterns` in Redis
          const urlPatternsKey = key.urlPatterns(templateID);
          client.hset(
            urlPatternsKey,
            name,
            JSON.stringify(updates.urlPatterns)
          );
        }
        view.locals = view.locals || {};
        view.retrieve = view.retrieve || {};
        view.partials = view.partials || {};

        var parseResult = parseTemplate(view.content);

        // TO DO REMOVE THIS
        if (type(view.partials, "array")) {
          var _partials = {};

          for (var i = 0; i < view.partials.length; i++)
            _partials[view.partials[i]] = null;

          view.partials = _partials;
        }

        extend(view.partials).and(parseResult.partials);

        detectInfinitePartialDependency(
          templateID,
          view,
          parseResult,
          function (infiniteError) {
            if (infiniteError) return callback(infiniteError);

            view.retrieve = parseResult.retrieve || {};

            view = serialize(view, viewModel);

            client.hmset(viewKey, view, function (err) {
              if (err) return callback(err);

              updateCdnManifest(templateID, function (manifestErr) {
                if (manifestErr) return callback(manifestErr);

                if (!changes) return callback();

                Blog.set(
                  metadata.owner,
                  { cacheID: Date.now() },
                  function (err) {
                    callback(err);
                  }
                );
              });
            });
          }
        );
      });
    });
  });
};

function detectInfinitePartialDependency(
  templateID,
  view,
  parseResult,
  callback
) {
  var viewName = view && view.name;
  var viewAlias = null;
  if (type(viewName, "string") && viewName.indexOf(".") > -1) {
    viewAlias = viewName.slice(0, viewName.lastIndexOf("."));
  }

  var stack = [];
  var cache = {};
  var visited = {};

  var rootInlinePartials = {};
  if (type(view && view.partials, "object")) {
    extend(rootInlinePartials).and(view.partials);
  }
  if (type(parseResult && parseResult.partials, "object")) {
    extend(rootInlinePartials).and(parseResult.partials);
  }

  traverse(viewName, rootInlinePartials, function (err) {
    if (err) return callback(err);
    callback(null);
  });

  function traverse(name, contextInlinePartials, done) {
    if (!type(name, "string")) return done();

    if (stack.indexOf(name) > -1) {
      return done(ERROR.INFINITE());
    }

    stack.push(name);

    resolveNode(name, contextInlinePartials, function (err, node) {
      if (err) {
        stack.pop();
        return done(err);
      }

      if (node && node.cacheable && visited[name]) {
        stack.pop();
        return done();
      }

      if (!node) {
        stack.pop();
        return done();
      }

      var deps = node.deps || [];
      var childContext = {};
      if (type(contextInlinePartials, "object"))
        extend(childContext).and(contextInlinePartials);
      if (type(node.inlinePartials, "object"))
        extend(childContext).and(node.inlinePartials);
      if (type(rootInlinePartials, "object"))
        extend(childContext).and(rootInlinePartials);

      eachSeries(
        deps,
        function (dep, next) {
          traverse(dep, childContext, next);
        },
        function (err) {
          stack.pop();
          if (!err && node.cacheable) visited[name] = true;
          done(err);
        }
      );
    });
  }

  function resolveNode(name, contextInlinePartials, done) {
    if (
      contextInlinePartials &&
      Object.prototype.hasOwnProperty.call(contextInlinePartials, name) &&
      contextInlinePartials[name] !== null &&
      contextInlinePartials[name] !== undefined
    ) {
      return done(null, buildFromInline(contextInlinePartials[name]));
    }

    if (
      rootInlinePartials &&
      Object.prototype.hasOwnProperty.call(rootInlinePartials, name) &&
      rootInlinePartials[name] !== null &&
      rootInlinePartials[name] !== undefined
    ) {
      return done(null, buildFromInline(rootInlinePartials[name]));
    }

    if (cache[name]) return done(null, cache[name]);

    if (isRootName(name)) {
      cache[name] = buildFromView(view, parseResult);
      return done(null, cache[name]);
    }

    if (name.charAt(0) === "/") {
      cache[name] = { deps: [], inlinePartials: {}, cacheable: true };
      return done(null, cache[name]);
    }

    getView(templateID, name, function (err, fetchedView) {
      if (err) {
        if (!err.message || err.message.indexOf("No view:") !== 0) {
          return done(err);
        }
      }

      if (!fetchedView) {
        cache[name] = { deps: [], inlinePartials: {}, cacheable: true };
        return done(null, cache[name]);
      }

      cache[name] = buildFromFetchedView(fetchedView);
      done(null, cache[name]);
    });
  }

  function isRootName(name) {
    return name === viewName || (viewAlias && name === viewAlias);
  }

  function buildFromView(view, parseResult) {
    var inlinePartials = {};

    if (type(view && view.partials, "object")) {
      extend(inlinePartials).and(view.partials);
    }

    if (type(parseResult && parseResult.partials, "object")) {
      extend(inlinePartials).and(parseResult.partials);
    }

    return {
      deps: Object.keys(inlinePartials),
      inlinePartials: inlinePartials,
      cacheable: true,
    };
  }

  function buildFromFetchedView(fetchedView) {
    var inlinePartials = {};

    if (type(fetchedView && fetchedView.partials, "object")) {
      extend(inlinePartials).and(fetchedView.partials);
    }

    var parsed = parseTemplate((fetchedView && fetchedView.content) || "");

    if (type(parsed && parsed.partials, "object")) {
      extend(inlinePartials).and(parsed.partials);
    }

    return {
      deps: Object.keys(inlinePartials),
      inlinePartials: inlinePartials,
      cacheable: true,
    };
  }

  function buildFromInline(partialValue) {
    var inlinePartials = {};
    var content = "";

    if (type(partialValue, "object")) {
      if (type(partialValue.partials, "object")) {
        extend(inlinePartials).and(partialValue.partials);
      }

      if (type(partialValue.content, "string")) {
        content = partialValue.content;
      }
    } else if (type(partialValue, "string")) {
      content = partialValue;
    }

    var parsed = parseTemplate(content || "");

    if (type(parsed && parsed.partials, "object")) {
      extend(inlinePartials).and(parsed.partials);
    }

    return {
      deps: Object.keys(inlinePartials),
      inlinePartials: inlinePartials,
      cacheable: false,
    };
  }
}

function eachSeries(list, iterator, done) {
  var index = 0;
  var items = Array.isArray(list) ? list : [];

  function next(err) {
    if (err) return done(err);
    if (index >= items.length) return done();

    iterator(items[index++], next);
  }

  next();
}
