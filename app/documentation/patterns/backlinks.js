module.exports = {
  slug: "backlinks",
  title: "Backlinks",
  summary:
    "List other entries that link to the current page, hidden entirely when nothing points here.",
  category: "Metadata",
  sourceTemplates: [
    {
      name: "Text",
      files: ["app/templates/source/text/entry.html"],
    },
    {
      name: "Hypertext",
      files: ["app/templates/source/hypertext/entry.html"],
    },
    {
      name: "Links",
      files: ["app/templates/source/links/_entry_layout.html"],
    },
  ],
  whenToUse:
    "Use this on wiki-like or notebook templates where posts link to each other. Skip it on a straightforward blog whose posts rarely cross-link, or if you would rather not expose that graph.",
  htmlFile: "entry.html",
  html: `{{#entry}}
{{#backlinks.length}}
<aside class="backlinks">
  <h2>Links to this page</h2>
  <ul>
    {{#backlinks}}
    <li>
      <a href="{{{url}}}">{{title}}</a>
      {{#summary}}<p>{{summary}}</p>{{/summary}}
    </li>
    {{/backlinks}}
  </ul>
</aside>
{{/backlinks.length}}
{{/entry}}`,
  cssFile: "style.css",
  css: `.backlinks {
  margin: 2em 0 0;
  padding: 1.25em 0 0;
  border-top: 1px solid currentColor;
}

.backlinks h2 {
  margin: 0 0 0.75em;
  font-size: 0.75em;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  font-weight: 600;
  opacity: 0.55;
}

.backlinks ul {
  list-style: none;
  margin: 0;
  padding: 0;
}

.backlinks li + li {
  margin-top: 0.75em;
}

.backlinks a {
  color: inherit;
  font-weight: 600;
}

.backlinks p {
  margin: 0.2em 0 0;
  font-size: 0.9em;
  opacity: 0.7;
}`,
  demoHTML: `<aside class="backlinks">
  <h2>Links to this page</h2>
  <ul>
    <li>
      <a href="#">A later harvest</a>
      <p>What changed after the frost.</p>
    </li>
    <li>
      <a href="#">Index of groves</a>
      <p>A running list of places mentioned in these notes.</p>
    </li>
  </ul>
</aside>`,
  demoCaption:
    "Each item is a full entry object, so title, URL, and summary are available. The block is omitted when the list is empty.",
  guidance: `\`backlinks\` is an array of [entries](/developers/reference#entry) that contain a link to the current page. It is empty when nothing on the site points here.

**How to add it**

- Guard with \`{{#backlinks.length}}\` (inside \`{{#entry}}\`) or \`{{#entry.backlinks.length}}\` (outside). Without the guard you will render an empty “Links to this page” heading.
- Inside the entry context Hypertext writes \`{{#entry.backlinks}}\`. That also works. \`{{#backlinks}}\` is enough once you are already in \`{{#entry}}\`.
- Each backlink is an entry: \`{{{url}}}\`, \`{{title}}\`, \`{{summary}}\`, thumbnails, dates. Text shows title plus summary; Hypertext and Links show title only.
- Put the list after the entry body, often below tags and above adjacent posts.
- Do not try to compute backlinks in the template. Blot fills this array from the site’s link graph when the entry is rendered.

**Common mistakes**

- Closing the inner loop with the wrong tag. The HTML above must use \`{{/backlinks}}\`, not \`{{/entry.backlinks}}\`, if the opening tag was \`{{#backlinks}}\`.
- Using this as a substitute for tags or a related-posts plugin. Backlinks are *incoming* links, not “similar posts”.
- Forgetting \`{{{url}}}\`. Same escaping rule as every other entry URL.`,
  accessibility: `- An \`<aside>\` (or a labeled \`<section>\`) keeps the list out of the main article landmark.
- The heading is the accessible name for the list. “Links to this page” / “Links here” is clearer than “Backlinks” for readers who do not use that jargon.
- Hide the whole aside when \`length\` is 0 so assistive tech does not announce an empty region.`,
  related: ["adjacent-posts", "tag-links", "archives-chronological"],
};
