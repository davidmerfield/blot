const { tryEach, eachOf } = require("async");
const { resolve, dirname } = require("path");
const byPath = require("./byPath");
const byFilename = require("./byFilename");
const byURL = require("./byURL");
const byTitle = require("./byTitle");
const byHeadingAnchor = require("./byHeadingAnchor");
const { decode } = require("he");
const makeSlug = require("helper/makeSlug");

function render($, callback, { blogID, path }) {
  const wikilinks = $("[title='wikilink']");
  let dependencies = [];

  eachOf(
    wikilinks,
    function (node, i, next) {
      if (!node || !node.name) return next();

      const $node = $(node);
      const isLink = node.name === "a";
      const mediaSource = $node.attr("src");
      const isMedia = !isLink && mediaSource !== undefined;

      if (!isLink && !isMedia) return next();

      const attribute = isLink ? "href" : "src";
      const rawTarget = isLink ? $node.attr(attribute) : mediaSource;

      if (!rawTarget) return next();

      // Pandoc encodes certain characters in the
      // wikilink as HTML entities, e.g.
      // "Hello's" to "Hello&#39;s"
      // This library will decode HTML entities (HE)
      // for us, hopefully safely
      const href = decode(rawTarget);

      // Rougly compare the href and text contents of the link
      // if they don't match the user did something like this:
      // [[target|Title here]]
      const piped = isLink && makeSlug($node.html()) !== makeSlug(href);

      const lookups = [
        byPath.bind(null, blogID, path, href, isLink),
        byFilename.bind(null, blogID, path, href, isLink),
        byURL.bind(null, blogID, href),
        byTitle.bind(null, blogID, href),
        byHeadingAnchor.bind(null, $, href),
      ];

      tryEach(lookups, function (err, result) {
        if (err || !result || !result.url) {
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
          return next();
        }

        const { url, title, path: linkedPath } = result;

        if (isLink) {
          console.log("Setting link href to", url);
          $node.attr("href", url);
          if (!piped) {
            console.log("Setting link text to", title || url);
            $node.text(title || url);
          }
        } else {
          $node.attr("src", linkedPath);

          // if the node is an image, replace the title text with the alt text
          // if the title text is 'wikilink' (which is what pandoc sets it to)
          const altText = $node.attr("alt");
          if (altText && altText.toLowerCase() !== "wikilink") {
            $node.attr("title", altText);
          }

          // if the node is an image and the next node is a span class=caption
          // then we set the caption text to the alt text
          const nextNode = $node.next();
          if (
            nextNode &&
            nextNode.length &&
            nextNode[0].name === "span" &&
            nextNode.attr("class") === "caption" &&
            nextNode.text().trim() === "wikilink"
          ) {
            nextNode.text(altText || "");
          }
        }

        if (linkedPath) {
          dependencies.push(linkedPath);
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
