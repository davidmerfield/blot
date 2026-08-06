const SKIP_SELECTOR = "script,style,pre,code";
const VISIBLE_LEADING_SELECTOR = "img,video,audio,iframe,object,embed";

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

  if (node.type === "text") {
    return /\S/.test(node.data || "") ? node : null;
  }

  if (node.type !== "tag") return null;

  const tagName = (node.name || "").toLowerCase();

  if (SKIP_SELECTOR.split(",").indexOf(tagName) !== -1) return null;
  if (VISIBLE_LEADING_SELECTOR.split(",").indexOf(tagName) !== -1) return false;

  let child = node.children && node.children[0];
  while (child) {
    const found = firstTextNode(child);
    if (found === false) return false;
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

function appendTitleTextNode($titleInner, node, isFirstTitleNode, isLastTitleNode) {
  if (node.type === "text") {
    if (isFirstTitleNode) node.data = (node.data || "").replace(/^\s+/, "");
    if (isLastTitleNode) node.data = (node.data || "").replace(/\s+$/, "");
    if (!node.data) return false;
  }

  $titleInner.append(node);
  return true;
}

function extractTitleLine($, $firstContainer, $titleInner, defaultTitle) {
  const bodyNodes = [];
  const titleNodes = [];
  let inBody = false;
  let sawBoundary = false;

  $firstContainer.contents().toArray().forEach(function (node) {
    if (inBody) {
      if (!bodyNodes.length && node.type === "text") {
        node.data = (node.data || "").replace(/^\s+/, "");
      }
      bodyNodes.push(node);
      return;
    }

    if (node.type === "text" && /[\n\r]/.test(node.data || "")) {
      const parts = (node.data || "").split(/\r?\n/);
      node.data = parts.shift();
      titleNodes.push(node);

      const bodyText = parts.join("\n").replace(/^\s+/, "");
      if (bodyText) bodyNodes.push({ type: "text", data: bodyText });
      inBody = true;
      sawBoundary = true;
      return;
    }

    if (node.type === "tag" && (node.name || "").toLowerCase() === "br") {
      $(node).remove();
      inBody = true;
      sawBoundary = true;
      return;
    }

    titleNodes.push(node);
  });

  while (
    titleNodes.length &&
    titleNodes[titleNodes.length - 1].type === "text" &&
    !/\S/.test(titleNodes[titleNodes.length - 1].data || "")
  ) {
    titleNodes.pop();
  }

  let appendedTitleNode = false;
  titleNodes.forEach(function (node, index) {
    appendedTitleNode =
      appendTitleTextNode(
        $titleInner,
        node,
        !appendedTitleNode,
        index === titleNodes.length - 1
      ) ||
      appendedTitleNode;
  });

  if (!$titleInner.text().trim() && !$titleInner.children().length) {
    $titleInner.text(defaultTitle);
    return { bodyNodes: bodyNodes, consumedFirstContainer: sawBoundary };
  }

  return { bodyNodes: bodyNodes, consumedFirstContainer: true };
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
  const defaultTitle = titleCase(originalType);
  const markerLength = match[0].length - (match[3] || "").length;

  textNode.data = (textNode.data || "").slice(markerLength).replace(/^\s+/, "");

  const $callout = fold
    ? $('<details class="callout"></details>')
    : $('<div class="callout"></div>');
  $callout.attr("data-callout", canonicalType);
  $callout.attr("data-callout-original", originalType);
  if (fold) {
    $callout.attr("data-callout-fold", fold);
    if (fold === "+") $callout.attr("open", "");
  }

  const $title = fold
    ? $('<summary class="callout-title"></summary>')
    : $('<div class="callout-title"></div>');
  $title.append('<span class="callout-icon" aria-hidden="true"></span>');
  const $titleInner = $('<span class="callout-title-inner"></span>');
  let firstContainer = $(textNode).parent().is($blockquote) ? textNode : $(textNode).parent()[0];

  while (firstContainer.parent && firstContainer.parent !== $blockquote[0]) {
    firstContainer = firstContainer.parent;
  }

  const $firstContainer = $(firstContainer);
  const titleLine = extractTitleLine($, $firstContainer, $titleInner, defaultTitle);
  $title.append($titleInner);

  const $content = $('<div class="callout-content"></div>');
  if (titleLine.bodyNodes.length) {
    const $bodyParagraph = $("<p></p>");
    titleLine.bodyNodes.forEach(function (node) {
      $bodyParagraph.append(node);
    });
    $content.append($bodyParagraph);
  }
  children.forEach(function (node) {
    if (titleLine.consumedFirstContainer && node === $firstContainer[0]) return;
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
