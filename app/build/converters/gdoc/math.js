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

// Get element text with <br> treated as newlines (clone, replace br, then .text()).
function getTextWithLineBreaks($, node) {
  const clone = $(node).clone();
  clone.find("br").replaceWith("\n");
  return clone.text();
}

module.exports = function gdocMath($) {
  // Preprocess: paragraphs that contain both $$ and <br> have math split across
  // multiple text nodes (e.g. "$$" + <br> + "c=d" + <br> + "$$"), so the
  // per-text-node converter never sees "$$\nc=d\n$$" and doesn't run. Collapse
  // such <p> to a single text node with br→\n so display-math detection and
  // conversion work as usual below.
  $("p").each(function () {
    const $p = $(this);
    if ($p.html().indexOf(delimiter) === -1 || $p.find("br").length === 0) return;
    $p.text(getTextWithLineBreaks($, this));
  });

  eachTextNode($("body")[0], (textNode) => {
    const converted = convertMathInText(textNode.data);

    if (converted !== textNode.data) {
      $(textNode).replaceWith(converted);
    }
  });
};
