// Render span.math.inline and span.math.display, the normalized internal representation for TeX emitted by converters, into KaTeX HTML.
const katex = require("katex");

const SKIP_TAGS = ["script", "style", "code", "pre"];
const BLOCK_BOUNDARY_TAGS = [
  "p",
  "li",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "blockquote",
  "td",
  "th",
  "dt",
  "dd",
];
const BLOCK_BOUNDARY_SELECTOR = BLOCK_BOUNDARY_TAGS.join(",");

function escapeHtml(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderTex(source, display) {
  const original = source;

  if (!source) return "";

  try {
    return katex.renderToString(source.trim(), { displayMode: display });
  } catch (error) {
    const delimiter = display ? "$$" : "$";
    return delimiter + escapeHtml(original) + delimiter;
  }
}

function hasSiblingContent($parent, $exclude) {
  return $parent
    .contents()
    .toArray()
    .some(function (node) {
      if (node === $exclude[0]) return false;
      if (node.type === "text") return /\S/.test(node.data || "");
      return node.type === "tag";
    });
}

// Display math sharing its nearest text-content block with other content should
// render inline so it doesn't break out of the line.
function isMixedBlockDisplay($span) {
  let $node = $span;
  let $parent = $node.parent();
  let mixed = false;

  while ($parent.length) {
    if (hasSiblingContent($parent, $node)) mixed = true;

    if ($parent.is(BLOCK_BOUNDARY_SELECTOR)) return mixed;

    $node = $parent;
    $parent = $node.parent();
  }

  return false;
}

function renderPandocMath($) {
  $("span.math.inline, span.math.display").each(function () {
    const $span = $(this);
    if ($span.closest(SKIP_TAGS.join(",")).length) return;

    let display = $span.hasClass("display");
    if (display && isMixedBlockDisplay($span)) {
      display = false;
    }

    const source = $span.text();

    $span.replaceWith(renderTex(source, display));
  });
}

function render($, callback) {
  if (!$ || typeof $ !== "function") return callback(null);

  renderPandocMath($);

  callback(null);
}

module.exports = {
  category: "codemath",
  title: "Math",
  description: "Enable TeX equations",
  render,
};
