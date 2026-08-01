// Render span.math.inline and span.math.display, the normalized internal representation for TeX emitted by converters, into KaTeX HTML.
const katex = require("katex");

const SKIP_TAGS = ["script", "style", "code", "pre"];

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
  return $parent.contents().toArray().some(function (node) {
    if (node === $exclude[0]) return false;
    if (node.type === "text") return /\S/.test(node.data || "");
    return true;
  });
}

// Display math inside a paragraph with other content (or nested in em/strong/etc.)
// should render inline so it doesn't break out of the line.
function isMixedParagraphDisplay($span) {
  let $node = $span;
  let $parent = $node.parent();

  while ($parent.length && !$parent.is("p")) {
    $node = $parent;
    $parent = $node.parent();
  }

  if (!$parent.is("p")) return false;

  // Nested under an inline wrapper inside the paragraph
  if ($node[0] !== $span[0]) return true;

  return hasSiblingContent($parent, $span);
}

function renderPandocMath($) {
  $("span.math.inline, span.math.display").each(function () {
    const $span = $(this);
    if ($span.closest(SKIP_TAGS.join(",")).length) return;

    let display = $span.hasClass("display");
    if (display && isMixedParagraphDisplay($span)) {
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
