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

        var infiniteError = detectInfinitePartialDependency(view, parseResult);
        if (infiniteError) return callback(infiniteError);

        view.retrieve = parseResult.retrieve || [];

        view = serialize(view, viewModel);

        client.hmset(viewKey, view, function (err) {
          if (err) return callback(err);

          if (!changes) return callback();

          Blog.set(metadata.owner, { cacheID: Date.now() }, function (err) {
            callback(err);
          });
        });
      });
    });
  });
};

function detectInfinitePartialDependency(view, parseResult) {
  var graph = {};
  var viewName = view && view.name;
  var viewPartials = (view && view.partials) || {};
  var parsePartials = (parseResult && parseResult.partials) || {};

  if (viewName) {
    graph[viewName] = Object.keys(parsePartials);
  }

  var ensureNode = function (name) {
    if (!graph[name]) graph[name] = [];
  };

  if (graph[viewName]) {
    graph[viewName].forEach(ensureNode);
  }

  for (var partialName in viewPartials) {
    ensureNode(partialName);

    var partialValue = viewPartials[partialName];
    var partialContent = partialValue;

    if (type(partialValue, "object") && type(partialValue.content, "string")) {
      partialContent = partialValue.content;
    }

    if (type(partialContent, "string")) {
      var parsed = parseTemplate(partialContent || "");
      graph[partialName] = Object.keys((parsed && parsed.partials) || {});
      graph[partialName].forEach(ensureNode);
    }
  }

  var visiting = {};
  var visited = {};

  function walk(node) {
    if (!node) return null;
    if (visiting[node]) return ERROR.INFINITE();
    if (visited[node]) return null;

    visiting[node] = true;

    var deps = graph[node] || [];
    for (var i = 0; i < deps.length; i++) {
      var dep = deps[i];
      var err = walk(dep);
      if (err) return err;
    }

    visiting[node] = false;
    visited[node] = true;

    return null;
  }

  var roots = [];

  if (viewName) roots.push(viewName);

  roots = roots.concat(Object.keys(viewPartials));

  for (var r = 0; r < roots.length; r++) {
    var error = walk(roots[r]);
    if (error) return error;
  }

  return null;
}
