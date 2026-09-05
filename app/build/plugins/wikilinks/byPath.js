const caseSensitivePath = require("helper/caseSensitivePath");
const { join, resolve, basename, dirname } = require("path");
const localPath = require("helper/localPath");
const makeSlug = require("helper/makeSlug");
const { tryEach } = require("async");
const fs = require("fs-extra");

// We want to think about the specific kinds of wikilinks we want to
// support here. The first should be a relative path, e.g.

// pathOfPost: /Posts/Foo/post.txt
// wikilink: [[subFolder/target]]
// target: /Posts/Foo/subFolder/target.txt

// Another variant of relative path to support:
// pathOfPost: /Posts/Foo/post.txt
// wikilink: [[./subFolder/target]]
// target: /Posts/Foo/subFolder/target.txt

// A further type of relative path to support:
// pathOfPost: /Posts/Foo/post.txt
// wikilink: [[./subFolder/target]]
// target: /Posts/Foo/subFolder/target.txt

// Next we support absolute paths:

// pathOfPost: /Posts/post.txt
// wikilink: [[/Posts/target]]
// target: /Posts/target.txt

module.exports = function byPath(blogID, pathOfPost, href, isLink, callback) {
  const root = localPath(blogID, "/");
  const getEntry = require("models/entry").get;

  // if pathOfPost is '/Posts/foo.txt' then dirOfPost is '/Posts'
  const dirOfPost = dirname(pathOfPost);

  // if href is 'sub/Foo.txt' and dirOfPost is '/Posts' then
  // resolvedHref is '/Posts/sub/Foo.txt'
  const resolvedHref = resolve(dirOfPost, href);

  const lookups = [
    exact.bind(null, blogID, href),
    exact.bind(null, blogID, resolvedHref),
    caseInsensitive.bind(null, blogID, href),
    caseInsensitive.bind(null, blogID, resolvedHref),
    rough.bind(null, blogID, href),
    rough.bind(null, blogID, resolvedHref),
  ];

  // When the converter (e.g. Pandoc) resolves embed paths relative to the
  // document, we get e.g. /Daily/Notes/Checklist for ![[Notes/Checklist]] in
  // /Daily/Plan.txt. The file is at /Notes/Checklist.md. Try the path as if
  // relative to blog root by stripping the current post's directory prefix.
  if (
    !isLink &&
    href.startsWith("/") &&
    dirOfPost !== "/" &&
    href.startsWith(dirOfPost + "/")
  ) {
    const rootRelative = href.slice(dirOfPost.length).replace(/^\//, "");
    if (rootRelative !== href) {
      lookups.push(
        exact.bind(null, blogID, rootRelative.startsWith("/") ? rootRelative : "/" + rootRelative),
        rough.bind(null, blogID, rootRelative.startsWith("/") ? rootRelative : "/" + rootRelative)
      );
    }
  }

  function exact(blogID, path, done) {
    getEntry(blogID, path, (entry) => {
      if (!entry || !entry.url || entry.deleted)
        return done(new Error("No entry"));
      done(null, entry);
    });
  }

  function rough(blogID, path, done) {
    searchForExtension(blogID, path, function (err, finalPath) {
      if (err || !finalPath) return done(new Error("No path"));
      getEntry(blogID, finalPath, (entry) => {
        if (!entry || !entry.url || entry.deleted)
          return done(new Error("No entry"));
        done(null, entry);
      });
    });
  }

  function caseInsensitive(blogID, path, done) {
    caseSensitivePath(root, path, function (err, absolutePath) {
      if (err || !absolutePath) return done(err || new Error("No path"));

      const correctPath = join("/", absolutePath.slice(root.length));

      getEntry(blogID, correctPath, (entry) => {
        if (!entry || !entry.url || entry.deleted)
          return done(new Error("No entry"));
        done(null, entry);
      });
    });
  }

  // e.g '/blog/post' -> '/blog/post.md'
  function searchForExtension(blogID, path, done) {
    const dir = dirname(path);
    const base = basename(path);

    caseSensitivePath(root, dir, function (err, absoluteDir) {
      // doesn't work for the root blog folder
      if (!absoluteDir && (dir === "/" || dir === ".")) {
        err = null;
        absoluteDir = localPath(blogID, "/");
      }

      if (err || !absoluteDir) return done(err || new Error("No dir"));

      fs.readdir(absoluteDir, function (err, contents) {
        if (err) return done(err);
        const correctDir = join("/", absoluteDir.slice(root.length));

        const perfectMatch = contents.find((item) => item.startsWith(base));

        if (perfectMatch) return done(null, join(correctDir, perfectMatch));

        const roughMatch = contents.find((item) =>
          normalize(item).startsWith(normalize(base))
        );

        if (roughMatch) return done(null, join(correctDir, roughMatch));

        return done(new Error("No matching file"));
      });
    });
  }

  tryEach(lookups, function (err, entry) {
    if (entry) return callback(null, entry);

    callback(new Error("No entry found by path"));
  });
};

function normalize(str) {
  return stripNonAlphaNumeric(makeSlug(str));
}

function stripNonAlphaNumeric(str) {
  return str.toLowerCase().replace(/[^a-z0-9]/g, "");
}
