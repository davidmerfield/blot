// Converts email-style '>' quotes in a Google Doc into semantic blockquotes.
//
// This runs after linebreaks() has joined each run of adjacent Google Docs
// paragraphs into a single <p> whose original lines are separated by <br>.
// So we work line by line inside each paragraph, rather than paragraph by
// paragraph, and emit the same structure a Markdown post would produce:
//
//   <blockquote><p>First line<br>Second line</p></blockquote>
//
// A line containing only the quote marker separates paragraphs within a
// single quote, matching the example documented in views/how/files.

// The document is parsed with decodeEntities:false so the quote marker
// appears in text nodes as either '>' or '&gt;'
const MARKER = "(?:&gt;|>)";
const BLANK = "(?:&nbsp;|\\s)";

// The marker must be followed by a space or end the line, so that a line
// like '>50% of users' remains an ordinary paragraph
const LEADING_MARKER = new RegExp(
  "^" + BLANK + "*" + MARKER + "(?:" + BLANK + "|$)"
);
const STRIP_MARKER = new RegExp("^" + BLANK + "*" + MARKER + BLANK + "?");

const isBlank = (text) => text.replace(/&nbsp;/gi, " ").trim() === "";

// Elements which are content in their own right, even though they hold no
// text of their own. A quoted line containing one is not a marker-only line.
const EMBEDDED = [
  "img",
  "picture",
  "source",
  "svg",
  "canvas",
  "video",
  "audio",
  "iframe",
  "embed",
  "object",
  "input",
  "table",
];

module.exports = ($) => {
  const text = (node) => (node.type === "text" ? node.data : $(node).text());

  // The first text node in document order with something other than
  // whitespace in it, or null if this line has no text at all
  const firstTextNode = (nodes) => {
    for (const node of nodes) {
      if (node.type === "text") {
        if (!isBlank(node.data)) return node;
      } else if (node.children && node.children.length) {
        const found = firstTextNode(node.children);
        if (found) return found;
      }
    }

    return null;
  };

  // Split a paragraph's children into lines at each top-level <br>
  const toLines = (nodes) => {
    const lines = [[]];

    nodes.forEach((node) => {
      if (node.type === "tag" && node.name === "br") lines.push([]);
      else lines[lines.length - 1].push(node);
    });

    return lines.map((nodes) => {
      const leading = firstTextNode(nodes);

      return {
        nodes,
        isQuote: !!leading && LEADING_MARKER.test(leading.data),
        leading,
      };
    });
  };

  // Remove the marker from the line, so '> Hello' becomes 'Hello'
  const stripMarker = (line) => {
    line.leading.data = line.leading.data.replace(STRIP_MARKER, "");
    return line;
  };

  // Whether a line holds nothing but whitespace
  const isEmpty = (line) =>
    line.nodes.every((node) => node.type === "text" && isBlank(node.data));

  // Whether a line contains an element which is content of its own, such as
  // an image, at any depth
  const hasEmbedded = (nodes) =>
    nodes.some(
      (node) =>
        node.type === "tag" &&
        (EMBEDDED.indexOf(node.name) > -1 ||
          (node.children && hasEmbedded(node.children)))
    );

  // Whether a quoted line is empty once its marker is removed, e.g. '>'
  // Such lines separate the paragraphs of a single quote
  const isSeparator = (line) =>
    !hasEmbedded(line.nodes) &&
    isBlank(line.nodes.map(text).join("").replace(STRIP_MARKER, ""));

  // Join lines with <br> inside a fresh element, moving the original
  // nodes across so links, emphasis and images survive untouched
  const wrap = (tagName, attribs, lines) => {
    const $el = $("<" + tagName + "></" + tagName + ">");

    if (attribs) $el.attr(attribs);

    lines.forEach((line, index) => {
      if (index > 0) $el.append("<br>");
      line.nodes.forEach((node) => $el.append(node));
    });

    return $el;
  };

  // Turn a run of quoted lines into a blockquote whose paragraphs are
  // delimited by marker-only lines
  const toBlockquote = (lines) => {
    const $blockquote = $("<blockquote></blockquote>");
    let paragraph = [];

    const flush = () => {
      if (paragraph.length) $blockquote.append(wrap("p", null, paragraph));
      paragraph = [];
    };

    lines.forEach((line) => {
      if (isSeparator(line)) flush();
      else paragraph.push(stripMarker(line));
    });

    flush();

    // A quote of nothing but markers, e.g. a lone '>'
    if (!$blockquote.children().length) return null;

    return $blockquote;
  };

  $("p").each(function () {
    const $p = $(this);
    const lines = toLines($p.contents().toArray());

    // Leave every other paragraph exactly as it was
    if (!lines.some((line) => line.isQuote)) return;

    // Group the lines into alternating runs of quoted and ordinary lines,
    // then replace the paragraph with the elements they produce
    let run = [];

    const flush = () => {
      if (!run.length) return;

      // Don't leave an empty paragraph behind, e.g. for the whitespace
      // between a quote and the end of the paragraph
      if (!run[0].isQuote && run.every(isEmpty)) {
        run = [];
        return;
      }

      const $el = run[0].isQuote
        ? toBlockquote(run)
        : wrap("p", $p.attr(), run);

      if ($el) $p.before($el);
      run = [];
    };

    lines.forEach((line) => {
      if (run.length && run[0].isQuote !== line.isQuote) flush();
      run.push(line);
    });

    flush();

    $p.remove();
  });

  return $;
};
