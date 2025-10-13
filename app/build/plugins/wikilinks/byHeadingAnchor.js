const makeSlug = require("helper/makeSlug");

module.exports = function byHeadingAnchor($, href, done) {
  if (!href || !href.startsWith("#"))
    return done(new Error("Not a heading anchor"));

  const anchor = href.slice(1);
  const slug = makeSlug(anchor);

  const finalAnchor =
    findAnchorByIdOrName($, anchor) ||
    findAnchorByIdOrName($, slug) ||
    findAnchorByHeadingText($, slug) ||
    findAnchorBySlug($, slug) ||
    slug ||
    anchor;

  done(null, {
    type: "heading-anchor",
    href: "#" + finalAnchor,
    anchor: finalAnchor,
  });
};

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
