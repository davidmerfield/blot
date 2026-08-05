const SKIP_SELECTOR = "script,style,pre,code";

const TYPE_ALIASES = {
  note: "note",
  abstract: "abstract",
  summary: "abstract",
  tldr: "abstract",
  info: "info",
  todo: "todo",
  tip: "tip",
  hint: "tip",
  important: "tip",
  success: "success",
  check: "success",
  done: "success",
  question: "question",
  help: "question",
  faq: "question",
  warning: "warning",
  caution: "warning",
  attention: "warning",
  failure: "failure",
  fail: "failure",
  missing: "failure",
  danger: "danger",
  error: "danger",
  bug: "bug",
  example: "example",
  quote: "quote",
  cite: "quote",
};

const MARKER_RE = /^\s*\[!([A-Za-z][A-Za-z0-9_-]*)\]([+-])?[ \t]*([^\n\r]*)/;

function titleCase(value) {
  return value
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map(function (part) {
      return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
    })
    .join(" ");
}

function meaningfulChildren($blockquote) {
  return $blockquote.contents().toArray().filter(function (node) {
    return !(node.type === "text" && !/\S/.test(node.data || ""));
  });
}

function firstTextNode(node) {
  if (!node) return null;
  if (node.type === "text") return node;
  if (node.type !== "tag") return null;
  if (SKIP_SELECTOR.split(",").indexOf((node.name || "").toLowerCase()) !== -1) return null;
  let child = node.children && node.children[0];
  while (child) {
    const found = firstTextNode(child);
    if (found) return found;
    child = child.next;
  }
  return null;
}

function trimEmptyLeadingNodes($, $container) {
  let changed = true;
  while (changed) {
    changed = false;
    const contents = $container.contents().toArray();
    for (let i = 0; i < contents.length; i++) {
      const node = contents[i];
      if (node.type === "text" && !/\S/.test(node.data || "")) {
        $(node).remove();
        changed = true;
        break;
      }
      if (node.type === "tag" && !$(node).text().trim() && !$(node).children("img,video,audio,iframe,object,embed").length) {
        $(node).remove();
        changed = true;
        break;
      }
      break;
    }
  }
}

function transformBlockquote($, blockquote) {
  const $blockquote = $(blockquote);
  if ($blockquote.closest(SKIP_SELECTOR).length) return;

  const children = meaningfulChildren($blockquote);
  if (!children.length) return;

  const textNode = firstTextNode(children[0]);
  if (!textNode) return;

  const match = (textNode.data || "").match(MARKER_RE);
  if (!match) return;

  const originalType = match[1].toLowerCase();
  const canonicalType = TYPE_ALIASES[originalType] || "note";
  const fold = match[2] || "";
  const customTitle = match[3] || "";
  const defaultTitle = titleCase(originalType);
  const remainder = (textNode.data || "").slice(match[0].length);

  textNode.data = remainder.replace(/^\s+/, "");

  const $callout = $('<div class="callout"></div>');
  $callout.attr("data-callout", canonicalType);
  $callout.attr("data-callout-original", originalType);
  if (fold) $callout.attr("data-callout-fold", fold);

  const $title = $('<div class="callout-title"></div>');
  $title.append('<span class="callout-icon" aria-hidden="true"></span>');
  const $titleInner = $('<span class="callout-title-inner"></span>');
  const $firstContainer = $(textNode).parent().is($blockquote)
    ? $(textNode)
    : $(textNode).parent();

  const bodyNodesFromTitleLine = [];

  if (customTitle.trim()) {
    textNode.data = customTitle;
    const titleLineNodes = $firstContainer.contents().toArray();
    let inBody = false;

    titleLineNodes.forEach(function (node) {
      if (inBody) {
        if (!bodyNodesFromTitleLine.length && node.type === "text") {
          node.data = (node.data || "").replace(/^\s+/, "");
        }
        bodyNodesFromTitleLine.push(node);
        return;
      }

      if (node.type === "text" && /[\n\r]/.test(node.data || "")) {
        const parts = (node.data || "").split(/\r?\n/);
        node.data = parts.shift();
        $titleInner.append(node);

        const bodyText = parts.join("\n").replace(/^\s+/, "");
        if (bodyText) bodyNodesFromTitleLine.push({ type: "text", data: bodyText });
        inBody = true;
        return;
      }

      if (node.type === "tag" && (node.name || "").toLowerCase() === "br") {
        $(node).remove();
        inBody = true;
        return;
      }

      $titleInner.append(node);
    });
  } else {
    $titleInner.text(defaultTitle);
  }
  $title.append($titleInner);

  const $content = $('<div class="callout-content"></div>');
  if (bodyNodesFromTitleLine.length) {
    const $bodyParagraph = $("<p></p>");
    bodyNodesFromTitleLine.forEach(function (node) {
      $bodyParagraph.append(node);
    });
    $content.append($bodyParagraph);
  }
  children.forEach(function (node) {
    if (customTitle.trim() && node === $firstContainer[0]) return;
    $content.append(node);
  });
  trimEmptyLeadingNodes($, $content);

  $callout.append($title);
  $callout.append($content);
  $blockquote.replaceWith($callout);
}

function render($, callback) {
  if (!$ || typeof $ !== "function") return callback(null);

  $("blockquote").each(function () {
    transformBlockquote($, this);
  });

  callback(null);
}

module.exports = {
  category: "formatting",
  title: "Obsidian Callouts",
  description: "Convert Obsidian callout blockquotes into styled callout HTML.",
  render,
};
