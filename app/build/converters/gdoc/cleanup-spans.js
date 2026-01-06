const BLOCK_ELEMENTS = [
  "p",
  "div",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "blockquote",
  "ul",
  "ol",
  "li",
  "hr",
  "table",
  "thead",
  "tbody",
  "tr",
  "td",
  "th",
  "section",
  "article",
  "header",
  "footer",
  "nav",
  "aside",
];

module.exports = ($) => {
  const blockSelector = BLOCK_ELEMENTS.join(", ");

  const spans = $("span").get().reverse();

  spans.forEach((span) => {
    const $span = $(span);

    if ($span.find(blockSelector).length === 0) {
      $span.replaceWith($span.contents());
    }
  });

  return $;
};
