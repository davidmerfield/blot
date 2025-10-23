module.exports = ($) => {
  // Find all paragraph elements
  $("p").each(function () {
    const $p = $(this);
    let hasBlockquotePrefix = false;
    let hasLeadingNonBlockquoteContent = false;

    // Determine if the first non-empty piece of text starts with a blockquote prefix
    $p.contents().each(function () {
      if (hasBlockquotePrefix) {
        return;
      }

      const $node = $(this);
      const text = $node.text().trim();

      if (!text) {
        return;
      }

      if (text.startsWith("> ") || text.startsWith("&gt; ")) {
        hasBlockquotePrefix = true;
      } else {
        hasLeadingNonBlockquoteContent = true;
      }
    });

    // Only convert paragraphs where the first content is blockquote-prefixed
    if (hasBlockquotePrefix && !hasLeadingNonBlockquoteContent) {
      // Create a new blockquote element
      const $blockquote = $("<blockquote></blockquote>");

      // Move all content from paragraph to blockquote
      $p.contents().each(function () {
        const node = this;
        const $clone = $(node).clone();

        if ($clone.is("span") || node.nodeType === 3) {
          // Remove the '&gt; ' prefix from relevant text nodes
          const text = $clone.text();
          const newText = text.replace(/^(&gt;|>) /, "");

          if (text !== newText) {
            if (node.nodeType === 3) {
              $clone[0].nodeValue = newText;
            } else {
              $clone.text(newText);
            }
          }
        }

        // Append the cloned node to the blockquote
        $blockquote.append($clone);
      });

      // Replace the paragraph with the blockquote
      $p.replaceWith($blockquote);
    }
  });

  return $;
};
