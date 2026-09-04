module.exports = {
  slug: "pagination",
  title: "Pagination",
  summary:
    "Previous / next links and “Page N of M” from the {{#pagination}} object on list views.",
  category: "Lists",
  sourceTemplates: [
    {
      name: "Text",
      files: ["app/templates/source/text/entries.html"],
    },
    {
      name: "Studio",
      files: ["app/templates/source/studio/entries.html"],
    },
    {
      name: "Profile",
      files: ["app/templates/source/profile/_pagination.html"],
    },
    {
      name: "Album",
      files: ["app/templates/source/album/_navigation.html"],
    },
  ],
  whenToUse:
    "Add this to `entries.html` and `tagged.html` whenever the template lists posts. Skip it if the template uses infinite scroll, or if the list is `{{#all_entries}}` (archives are not paginated).",
  htmlFile: "entries.html",
  html: `{{#pagination}}
<nav class="pagination" aria-label="Pagination">
  {{#previous}}
  <a href="/page/{{previous}}" rel="prev">Newer</a>
  {{/previous}}
  <span class="pagination-status">Page {{current}} of {{total}}</span>
  {{#next}}
  <a href="/page/{{next}}" rel="next">Older</a>
  {{/next}}
</nav>
{{/pagination}}`,
  cssFile: "style.css",
  css: `.pagination {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.75em 1.25em;
  margin: 2em 0 0;
}

.pagination a {
  color: inherit;
}

.pagination-status {
  opacity: 0.65;
}

.pagination a[href]:hover,
.pagination a[href]:focus-visible {
  opacity: 0.7;
}`,
  demoHTML: `<nav class="pagination" aria-label="Pagination">
  <a href="#" rel="prev">Newer</a>
  <span class="pagination-status">Page 2 of 7</span>
  <a href="#" rel="next">Older</a>
</nav>`,
  demoCaption:
    "On page 1, `previous` is empty so the Newer link disappears. On the last page, `next` is empty.",
  guidance: `List views receive a \`pagination\` object with \`current\`, \`previous\`, \`next\`, \`total\`, \`page_size\`, and \`total_entries\`. \`previous\` and \`next\` are page numbers, or empty on the ends.

**How to add it**

- Guard the whole block with \`{{#pagination}}\` so a one-page site does not show “Page 1 of 1” unless you want that.
- On the homepage and other \`entries.html\` routes the URL is \`/page/{{next}}\` and \`/page/{{previous}}\`.
- On tag pages (\`tagged.html\`) the URL is \`/tagged/{{slug}}/page/{{next}}\`. Copy the block and change the href; \`{{slug}}\` is the current tag.
- \`{{#previous}}\` / \`{{#next}}\` are falsy on the first/last page. That hides the link. Do not output an \`<a>\` without \`href\`.
- Album puts “N of M” plus arrows in the header and hides them when \`{{#infinite_scroll}}\` is on. Same object, different placement.
- Profile labels the links “Newer Posts” / “Older Posts”. Prefer those words over “Previous/Next page” so they are not confused with adjacent *entries*.

**Common mistakes**

- Linking to \`/page/{{pagination.next}}\` from inside \`{{#pagination}}\`. Nested context already *is* the pagination object, so \`{{next}}\` is enough. \`{{pagination.next}}\` is for use *outside* the section.
- Using this on \`archives.html\`. Archives iterate \`{{#archives}}\` or \`{{#all_entries}}\` and are not paginated.
- Generating page numbers 1…N in the template. Blot does not pass a full page list; Links builds that in JavaScript. Stick to previous/next unless you have a reason not to.`,
  accessibility: `- Use \`<nav aria-label="Pagination">\` so it is not announced as the site menu.
- \`rel="prev"\` and \`rel="next"\` on the links help crawlers and some browsers.
- The status text (“Page 2 of 7”) should stay visible even when one of the links is missing, so the position in the set is still obvious.
- Do not rely on color to distinguish disabled ends; omit the link entirely.`,
  related: ["adjacent-posts", "search-form", "archives-chronological"],
};
