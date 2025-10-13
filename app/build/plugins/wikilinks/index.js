const { tryEach, eachOf } = require("async");
const { resolve, dirname } = require("path");
const byPath = require("./byPath");
const byURL = require("./byURL");
const byTitle = require("./byTitle");
const byHeadingAnchor = require("./byHeadingAnchor");
const { decode } = require("he");
const makeSlug = require("helper/makeSlug");

function render($, callback, { blogID, path }) {
  const wikilinks = $("a[title='wikilink']");
  let dependencies = [];

  eachOf(
    wikilinks,
    function (node, i, next) {
      // The cheerio object contains other
      // shit. We only want img tag elements
      if (!node || node.name !== "a") return next();

      // Pandoc encodes certain characters in the
      // wikilink as HTML entities, e.g.
      // "Hello's" to "Hello&#39;s"
      // This library will decode HTML entities (HE)
      // for us, hopefully safely
      const href = decode($(node).attr("href"));

      // Rougly compare the href and text contents of the link
      // if they don't match the user did something like this:
      // [[target|Title here]]
      const piped = makeSlug($(node).html()) !== makeSlug(href);

      if (href.startsWith("#")) {
        const anchor = href.slice(1);
        const normalizedAnchor = makeSlug(anchor);
        const finalAnchor = byHeadingAnchor($, anchor, normalizedAnchor);

        $(node).attr("href", "#" + finalAnchor);

        return next();
      }

      const lookups = [
        byPath.bind(null, blogID, path, href),
        byURL.bind(null, blogID, href),
        byTitle.bind(null, blogID, href),
      ];

      tryEach(lookups, function (err, entry) {
        if (entry) {
          const link = entry.url;

          $(node).attr("href", link);

          if (!piped) $(node).html(entry.title);

          dependencies.push(entry.path);
        } else {
          // we failed to find a path, we should register paths to watch
          // if pathOfPost is '/Posts/foo.txt' then dirOfPost is '/Posts'
          const dirOfPost = dirname(path);

          // if href is 'sub/Foo.txt' and dirOfPost is '/Posts' then
          // resolvedHref is '/Posts/sub/Foo.txt'
          const resolvedHref = resolve(dirOfPost, href);

          const pathsToWatch = [
            resolvedHref,
            resolvedHref + ".md",
            resolvedHref + ".txt",
          ];

          pathsToWatch.forEach((path) => dependencies.push(path));
        }
        next();
      });
    },
    function () {
      callback(null, dependencies);
    }
  );
}
module.exports = {
  render,
  category: "Typography",
  title: "Wikilinks",
  description: "Convert Wikilinks into links",
};
