module.exports = ($) => {
  // Find all paragraph elements
  $("p").each(function () {
    const $p = $(this);
    let isBlockquote = false;
    let hasNonBlockquoteContent = false;

    // Check if this paragraph contains spans starting with '&gt; '
    $p.find("span").each(function () {
      const text = $(this).text();
      if (text.startsWith("> ") || text.startsWith("&gt; ")) {
        isBlockquote = true;
      } else {
        hasNonBlockquoteContent = true;
      }
    });

    // If this paragraph is a blockquote and doesn't have non-blockquote content
    if (isBlockquote && !hasNonBlockquoteContent) {
      // Create a new blockquote element
      const $blockquote = $("<blockquote></blockquote>");

      // Move all content from paragraph to blockquote
      $p.contents().each(function () {
        const $this = $(this);

        if ($this.is("span")) {
          // Remove the '&gt; ' prefix from span text
          const text = $this.text();
          const newText = text.replace(/^(&gt;|>) /, "");
          $this.text(newText);
        }

        // Clone the node and append to blockquote
        $blockquote.append($this.clone());
      });

      // Replace the paragraph with the blockquote
      $p.replaceWith($blockquote);
    }
  });

  return $;
};
