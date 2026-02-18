const katex = require("katex");

const delimiter = "$$";
const SKIP_TAGS = ["script", "style", "code", "pre"];

function convertMathInText(text) {
  if (!text || text.indexOf(delimiter) === -1) return text;

  const tokens = text.split(delimiter);
  if (tokens.length < 3) return text;

  let remainder = "";

  if (tokens.length % 2 === 0) {
    remainder = delimiter + tokens.pop();
  }

  for (let i = 1; i < tokens.length; i += 2) {
    const source = tokens[i];
    const display =
      /^\s*\n/.test(source) ||
      (/^\s*$/.test(tokens[i - 1]) && /^\s*$/.test(tokens[i + 1] || ""));

    tokens[i] = renderTex(source, display);
  }

  return tokens.join("") + remainder;
}

function renderTex(source, display) {
  const original = source;

  if (!source) return "";

  try {
    return katex.renderToString(source.trim(), { displayMode: display });
  } catch (error) {
    return delimiter + original + delimiter;
  }
}

function textWithLineBreaks($, node) {
  const clone = $(node).clone();
  clone.find("br").replaceWith("\n");
  return clone.text();
}

function canFlattenLinebreakParagraph(node) {
  if (!node || !node.children) return false;

  return node.children.every((child) => child.type === "text" || child.name === "br");
}

function eachTextNode(node, cb) {
  if (!node || !node.children) return;

  node.children.forEach((child) => {
    if (child.type === "text") {
      cb(child);
      return;
    }

    if (SKIP_TAGS.includes(child.name)) return;

    eachTextNode(child, cb);
  });
}

function render($, callback) {
  $("p").each(function () {
    const $p = $(this);
    if ($p.html().indexOf(delimiter) === -1 || $p.find("br").length === 0) return;
    if (!canFlattenLinebreakParagraph(this)) return;

    $p.text(textWithLineBreaks($, this));
  });

  const rootNode = $("body")[0] || $.root()[0];

  eachTextNode(rootNode, (textNode) => {
    const converted = convertMathInText(textNode.data);

    if (converted !== textNode.data) {
      $(textNode).replaceWith(converted);
    }
  });

  callback(null);
}

module.exports = {
  category: "codemath",
  title: "Math",
  description: "Render TeX equations wrapped in $$...$$ in text-based posts",
  render,
};
