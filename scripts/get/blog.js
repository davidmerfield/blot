var User = require("models/user");
var Blog = require("models/blog");
var parseUrl = require("url").parse;

function getByPrefix(identifier, callback) {
  Blog.getAllIDs(function (err, blogIDS) {
    let id = blogIDS.filter((id) => id.indexOf(identifier) === 0)[0];
    if (!id) return callback(new Error("no blog"));
    Blog.get({ id }, callback);
  });
}

// Takes a URL or handle and fetches the blog and user
module.exports = function get(identifier, callback) {
  var domain;
  var handle;
  var blog;

  handle = identifier;

  var identifierWithoutTrailingSlash = (identifier || "").replace(/\/+$/, "");
  var identifierForParsing = /^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(
    identifierWithoutTrailingSlash
  )
    ? identifierWithoutTrailingSlash
    : "https://" + identifierWithoutTrailingSlash;

  try {
    var parsed = parseUrl(identifierForParsing.toLowerCase());

    if (parsed && parsed.host) {
      // Map 'preview.default.foo.blot.im' -> 'foo.blot.im'
      if (parsed.host.indexOf("preview.") === 0)
        domain = parsed.host.split(".").slice(-3).join(".");
      else domain = parsed.host;
    }
  } catch (e) {}

  if (!domain) domain = identifierWithoutTrailingSlash.toLowerCase();

  Blog.get({ id: identifier }, function (err, blogFromID) {
    Blog.get({ domain: domain }, function (err, blogFromDomain) {
      Blog.get({ handle: handle }, function (err, blogFromHandle) {
        getByPrefix(identifier, function (err, blogByPrefix) {
          if (
            !blogFromDomain &&
            !blogFromHandle &&
            !blogFromID &&
            !blogByPrefix
          )
            return callback(new Error("No blog"));

          blog = blogFromID || blogFromHandle || blogFromDomain || blogByPrefix;

          User.getById(blog.owner, function (err, user) {
            if (err || !user) return callback(err || new Error("No user"));

            require("../blog/access")(blog.handle, function (err, url) {
              if (err) return callback(err);
              callback(err, user, blog, url);
            });
          });
        });
      });
    });
  });
};
