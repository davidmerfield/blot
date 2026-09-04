module.exports = {
  slug: "tag-links",
  title: "Tag links",
  summary:
    "Render an entry’s tags as links to /tagged/:slug pages, hidden entirely when the entry has no tags.",
  category: "Metadata",
  sourceTemplates: [
    {
      name: "Blog",
      files: ["app/templates/source/blog/entry.html"],
    },
    {
      name: "Text",
      files: ["app/templates/source/text/entry.html"],
    },
    {
      name: "Gallery",
      files: ["app/templates/source/gallery/entry.html"],
    },
  ],
  whenToUse:
    "Use this on `entry.html`, `entries.html`, or any list partial when you want tags to be navigable. Skip it on templates that treat tags as plain text, or when you are filtering a list with `{{#tagged.Name}}` instead of linking out.",
  htmlFile: "entry.html",
  html: `{{#entry}}
{{#tags.length}}
<nav class="tags" aria-label="Tags">
  {{#tags}}{{^first}}, {{/first}}<a href="{{{url}}}">{{name}}</a>{{/tags}}
</nav>
{{/tags.length}}
{{/entry}}`,
  cssFile: "style.css",
  css: `.tags {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35em 0.75em;
  font-size: 0.875em;
}

.tags a {
  color: inherit;
  text-decoration: underline;
}

.tags a:hover,
.tags a:focus {
  opacity: 0.7;
}`,
  demoHTML: `<nav class="tags" aria-label="Tags">
  <a href="#">Photography</a>
  <a href="#">Travel</a>
  <a href="#">Field notes</a>
</nav>`,
  demoCaption: "Each tag should point at `/tagged/{{slug}}`. The demo links stay on this page.",
  guidance: `Each entry exposes a \`tags\` array. The useful properties on each item are:

- \`name\` (alias \`tag\`) — the display label
- \`slug\` — URL-safe form, used in \`/tagged/{{slug}}\`
- \`url\` — the relative URL to that tag page
- \`first\` / \`last\` — booleans for separators

**How to add it**

- Guard the whole block with \`{{#tags.length}}\` so an empty list does not leave a “Tags” heading or trailing punctuation.
- Prefer \`{{{url}}}\` over concatenating \`/tagged/{{slug}}\` yourself. The \`url\` field already includes the site’s path prefix.
- Inside \`{{#entry}}\`, \`{{#tags}}\` is enough. Outside an entry context use \`{{#entry.tags}}\`.
- For a site-wide tag index, iterate \`{{#all_tags}}\` the same way (see the [tagged routes reference](/developers/reference#tagged)).
- Do not invent a second tag taxonomy in the template. Tags come from file metadata and folder names.

**Separators**

Comma-separated lists use \`{{^first}}, {{/first}}\` (or \`{{^last}}, {{/last}}\` after the link). Gallery’s “under {{#tags}}…{{/tags}}” sentence form is also fine.

**Common mistakes**

- Linking to \`/tagged/{{name}}\` instead of \`{{{url}}}\` or \`/tagged/{{slug}}\`. Names can contain spaces.
- Forgetting HTML-escaping: \`{{name}}\` is correct (escaped); \`{{{url}}}\` is correct because the path contains slashes.
- Using this pattern when you actually want “all posts with this tag on the current page” — that is \`{{#tagged.Apple}}\` on \`all_entries\`, documented under Examples.`,
  accessibility: `- Wrap the list in \`<nav aria-label="Tags">\` so it is a distinct navigation landmark, not a stray pile of links.
- The link text must be the tag name. Do not replace it with a generic “Tag” label.
- If you add a heading (“Tags”), associate it with the list rather than leaving an empty heading when \`tags.length\` is 0 — the \`{{#tags.length}}\` guard handles that.`,
  related: ["backlinks", "archives-chronological", "task-lists"],
};
