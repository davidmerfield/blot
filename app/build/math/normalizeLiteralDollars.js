const escapeHtml = require("escape-html");

const SKIP_TAGS = ["script", "style", "code", "pre"];

function mathSpan(source, display) {
  const mode = display ? "display" : "inline";
  return '<span class="math ' + mode + '">' + escapeHtml(source.trim()) + '</span>';
}

function isEscaped(text, index) {
  let slashCount = 0;

  for (let i = index - 1; i >= 0 && text[i] === "\\"; i -= 1) {
    slashCount += 1;
  }

  return slashCount % 2 === 1;
}

function isWhitespace(char) {
  return char === undefined || /\s/.test(char);
}

function isDigit(char) {
  return char !== undefined && /\d/.test(char);
}

function delimiterAt(text, index) {
  if (text[index] !== "$" || isEscaped(text, index)) return null;
  return text[index + 1] === "$" ? "$$" : "$";
}

function canOpen(text, index, delimiter) {
  const next = text[index + delimiter.length];

  if (delimiter === "$$") return next !== undefined;

  return next !== undefined && !isWhitespace(next);
}

function canClose(text, index, delimiter) {
  const previous = text[index - 1];
  const next = text[index + delimiter.length];

  if (delimiter === "$$") return previous !== undefined;

  return previous !== undefined && !isWhitespace(previous) && !isDigit(next);
}

function findClosingDelimiter(text, start, delimiter) {
  for (let i = start; i < text.length; i += 1) {
    if (text.slice(i, i + delimiter.length) !== delimiter) continue;
    if (isEscaped(text, i)) continue;
    if (!canClose(text, i, delimiter)) continue;

    return i;
  }

  return -1;
}

function isDisplayMath(source, before, after, delimiter) {
  if (delimiter !== "$$") return false;

  return /^\s*\n/.test(source) || (/^\s*$/.test(before) && /^\s*$/.test(after || ""));
}

function normalizeMathInText(text) {
  if (!text || text.indexOf("$") === -1) return text;

  const parts = [];
  let cursor = 0;
  let textStart = 0;
  let converted = false;

  while (cursor < text.length) {
    const delimiter = delimiterAt(text, cursor);

    if (!delimiter || !canOpen(text, cursor, delimiter)) {
      cursor += 1;
      continue;
    }

    const sourceStart = cursor + delimiter.length;
    const close = findClosingDelimiter(text, sourceStart, delimiter);

    if (close === -1) {
      cursor += delimiter.length;
      continue;
    }

    const source = text.slice(sourceStart, close);
    const afterStart = close + delimiter.length;
    const before = text.slice(textStart, cursor);
    const after = text.slice(afterStart);

    parts.push(escapeHtml(before));
    parts.push(mathSpan(source, isDisplayMath(source, before, after, delimiter)));

    converted = true;
    cursor = afterStart;
    textStart = cursor;
  }

  if (!converted) return text;

  parts.push(escapeHtml(text.slice(textStart)));

  return parts.join("");
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

function normalizeLiteralDollarMath($) {
  $("p").each(function () {
    const $p = $(this);
    if ($p.html().indexOf("$$") === -1 || $p.find("br").length === 0) return;
    if (!canFlattenLinebreakParagraph(this)) return;

    $p.text(textWithLineBreaks($, this));
  });

  const rootNode = $("body")[0] || $.root()[0];

  eachTextNode(rootNode, (textNode) => {
    const converted = normalizeMathInText(textNode.data);

    if (converted !== textNode.data) {
      $(textNode).replaceWith(converted);
    }
  });
}

module.exports = {
  normalizeLiteralDollarMath,
  normalizeMathInText,
};
