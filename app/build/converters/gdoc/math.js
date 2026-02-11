const katex = require("katex");

const delimiter = "$$";

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

  let tex = source;

  if (display) {
    tex = tex.trim();
  }

  try {
    let rendered = katex.renderToString(tex, { displayMode: display });
    if (display) rendered = '<span class="has-katex">' + rendered + "</span>";
    return rendered;
  } catch (error) {
    return delimiter + original + delimiter;
  }
}

function eachTextNode(node, cb) {
  if (!node || !node.children) return;

  node.children.forEach((child) => {
    if (child.type === "text") {
      cb(child);
      return;
    }

    if (["script", "style", "code", "pre"].includes(child.name)) return;

    eachTextNode(child, cb);
  });
}

module.exports = function gdocMath($) {
  eachTextNode($("body")[0], (textNode) => {
    const converted = convertMathInText(textNode.data);

    if (converted !== textNode.data) {
      $(textNode).replaceWith(converted);
    }
  });
};
