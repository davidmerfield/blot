const katex = require("katex");

const delimiter = "$$";
const SKIP_TAGS = ["script", "style", "code", "pre"];

function renderTex(source, display) {
  const original = source;

  if (!source) return "";

  try {
    return katex.renderToString(source.trim(), { displayMode: display });
  } catch (error) {
    return delimiter + original + delimiter;
  }
}

function renderPandocMath($) {
  $("span.math.inline, span.math.display").each(function () {
    const $span = $(this);
    if ($span.closest(SKIP_TAGS.join(",")).length) return;

    const display = $span.hasClass("display");
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
