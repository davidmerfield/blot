module.exports = {
  slug: "adjacent-posts",
  title: "Adjacent posts",
  summary:
    "Link an entry to the next and previous posts in the site’s chronological list, using {{#next}} and {{#previous}}.",
  category: "Lists",
  sourceTemplates: [
    {
      name: "Text",
      files: ["app/templates/source/text/entry.html"],
    },
    {
      name: "Blog",
      files: ["app/templates/source/blog/entry.html"],
    },
    {
      name: "Index",
      files: ["app/templates/source/index/entry.html"],
    },
    {
      name: "Magazine",
      files: ["app/templates/source/magazine/entry.html"],
    },
  ],
  whenToUse:
    "Put this at the bottom of `entry.html` so a finished post leads somewhere. Skip it on pages (`{{#page}}`) and on templates that already use keyboard or header arrows for the same two URLs.",
  htmlFile: "entry.html",
  html: `{{#entry}}
{{#adjacent}}
<nav class="adjacent" aria-label="Adjacent posts">
  {{#next}}
  <a class="adjacent-item" href="{{{url}}}">
    <span class="adjacent-label">Next</span>
    <span class="adjacent-title">{{title}}</span>
    {{#summary}}<span class="adjacent-summary">{{summary}}</span>{{/summary}}
  </a>
  {{/next}}
  {{#previous}}
  <a class="adjacent-item" href="{{{url}}}">
    <span class="adjacent-label">Previously</span>
    <span class="adjacent-title">{{title}}</span>
    {{#summary}}<span class="adjacent-summary">{{summary}}</span>{{/summary}}
  </a>
  {{/previous}}
</nav>
{{/adjacent}}
{{/entry}}`,
  cssFile: "style.css",
  css: `.adjacent {
  display: grid;
  gap: 1em;
  margin: 2em 0 0;
  padding: 1.25em 0 0;
  border-top: 1px solid currentColor;
}

.adjacent-item {
  display: grid;
  gap: 0.2em;
  color: inherit;
  text-decoration: none;
}

.adjacent-label {
  font-size: 0.75em;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  opacity: 0.55;
}

.adjacent-title {
  font-weight: 600;
}

.adjacent-summary {
  font-size: 0.9em;
  opacity: 0.7;
}

.adjacent-item:hover .adjacent-title,
.adjacent-item:focus-visible .adjacent-title {
  text-decoration: underline;
}`,
  demoHTML: `<nav class="adjacent" aria-label="Adjacent posts">
  <a class="adjacent-item" href="#">
    <span class="adjacent-label">Next</span>
    <span class="adjacent-title">A later harvest</span>
    <span class="adjacent-summary">What changed after the frost.</span>
  </a>
  <a class="adjacent-item" href="#">
    <span class="adjacent-label">Previously</span>
    <span class="adjacent-title">Notes on citrus</span>
    <span class="adjacent-summary">Field notes from the groves.</span>
  </a>
</nav>`,
  demoCaption:
    "Next is the newer sibling; Previously is the older one. Either side can be missing at the ends of the list.",
  guidance: `On \`entry.html\`, Blot adds \`entry.next\`, \`entry.previous\`, and a boolean \`entry.adjacent\` (true if either sibling exists). Inside \`{{#entry}}\` you can write \`{{#next}}\` directly.

**Direction**

- \`previous\` is the older post in the entries list.
- \`next\` is the newer post.
- Blog wraps the block in \`{{#adjacent}}\` so an empty pair does not leave a heading. Text checks \`{{#next}}\` / \`{{#previous}}\` separately. Either approach works.

**How to add it**

- Put this after \`{{{html}}}\` on \`entry.html\`, not on the index.
- Use \`{{{url}}}\` and \`{{title}}\`. \`{{summary}}\` is optional; guard it with \`{{#summary}}\`.
- Pages (static menu items) often have no siblings. Album hides the arrows with \`{{^page}}\`. Do the same if the template mixes posts and pages.
- Index inserts a separator only when \`{{#adjacent}}\` is true, then prints the two links. Fine if you want a flatter layout.
- Pair with [keyboard adjacent](/developers/patterns/keyboard-adjacent) if the template is gallery-like. Use the same two URLs so the arrows and keys agree.

**Common mistakes**

- Treating this as pagination. Pagination walks *pages of a list* (\`/page/2\`). Adjacent posts walk *entries*.
- Using \`{{next}}\` as a URL. It is an entry object. The URL is \`{{{next.url}}}\`, or \`{{{url}}}\` inside \`{{#next}}\`.
- Showing this on \`entries.html\`. Index lists already *are* the neighbors.`,
  accessibility: `- \`<nav aria-label="Adjacent posts">\` distinguishes this from site navigation and pagination.
- The visible label (“Next”, “Previously”) should precede the title so the link name is unique when two posts share similar titles.
- Do not use icon-only arrows without a text alternative.`,
  related: ["pagination", "keyboard-adjacent", "backlinks"],
};
