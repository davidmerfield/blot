const { tryEach, eachOf } = require("async");
const { resolve, dirname } = require("path");
const byPath = require("./byPath");
const byURL = require("./byURL");
const byTitle = require("./byTitle");
const { decode } = require("he");
const makeSlug = require("helper/makeSlug");

function findHeadingAnchor($, anchor, normalizedAnchor) {
  const existingMatch =
    findAnchorByIdOrName($, anchor) ||
    findAnchorByIdOrName($, normalizedAnchor);

  if (existingMatch) return existingMatch;

  const anchorSlug = makeSlug(anchor);

  const headingMatch = findAnchorByHeadingText($, anchorSlug);
  if (headingMatch) return headingMatch;

  const fuzzyMatch = findAnchorBySlug($, anchorSlug);
  if (fuzzyMatch) return fuzzyMatch;

  return normalizedAnchor || anchor;
}

function findAnchorByIdOrName($, value) {
  if (!value) return null;

  let match = null;

  $(`[id]`).each((_, element) => {
    if ($(element).attr("id") === value) {
      match = value;
      return false;
    }
  });

  if (match) return match;

  $(`[name]`).each((_, element) => {
    if ($(element).attr("name") === value) {
      match = value;
      return false;
    }
  });

  return match;
}

function findAnchorByHeadingText($, targetSlug) {
  if (!targetSlug) return null;

  const headings = $("h1, h2, h3, h4, h5, h6");
  let match = null;

  headings.each((_, element) => {
    if (match) return false;

    const $heading = $(element);
    const headingSlug = makeSlug($heading.text());

    if (!headingSlug || headingSlug !== targetSlug) return;

    const anchorId =
      $heading.attr("id") ||
      findFirstAttribute($, $heading, "id") ||
      findFirstAttribute($, $heading, "name");

    if (anchorId) {
      match = anchorId;
      return false;
    }
  });

  return match;
}

function findAnchorBySlug($, slug) {
  if (!slug) return null;

  let match = null;

  $(`[id]`).each((_, element) => {
    const id = $(element).attr("id");
    if (id && makeSlug(id) === slug) {
      match = id;
      return false;
    }
  });

  if (match) return match;

  $(`[name]`).each((_, element) => {
    const name = $(element).attr("name");
    if (name && makeSlug(name) === slug) {
      match = name;
      return false;
    }
  });

  return match;
}

function findFirstAttribute($, $element, attribute) {
  if (!$element || !$element.length) return null;

  if ($element.attr(attribute)) return $element.attr(attribute);

  let found = null;

  $element
    .find(`[${attribute}]`)
    .each((_, node) => {
      if (found) return false;

      const value = $(node).attr(attribute);
      if (value) {
        found = value;
        return false;
      }
    });

  return found;
}

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
        const finalAnchor = findHeadingAnchor($, anchor, normalizedAnchor);

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
