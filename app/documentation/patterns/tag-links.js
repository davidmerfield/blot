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
  html: `{{#tags.length}}
<nav class="tags" aria-label="Tags">
  {{#tags}}{{^first}}, {{/first}}<a href="/tagged/{{slug}}">{{name}}</a>{{/tags}}
</nav>
{{/tags.length}}`,
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
- \`slug\` — URL-safe form, already \`encodeURIComponent\`’d, used in \`/tagged/{{slug}}\`
- \`first\` / \`last\` — booleans for separators

Entry tags do **not** have a \`url\` field. Blog and Text templates concatenate \`/tagged/{{slug}}\`.

**How to add it**

- Guard the whole block with \`{{#tags.length}}\` so an empty list does not leave a “Tags” heading or trailing punctuation.
- Drop this snippet inside \`{{#entry}}\` or \`{{#posts}}\` (or any other context that already exposes \`tags\`). Do not wrap it in a second \`{{#entry}}\` — listing routes such as \`entries.html\` iterate \`{{#posts}}\`, not \`{{#entry}}\`.
- For a site-wide tag index, iterate \`{{#all_tags}}\` the same way (see the [tagged routes reference](/developers/reference#tagged)).
- Do not invent a second tag taxonomy in the template. Tags come from file metadata and folder names.

**Separators**

Comma-separated lists use \`{{^first}}, {{/first}}\` (or \`{{^last}}, {{/last}}\` after the link). Gallery’s “under {{#tags}}…{{/tags}}” sentence form is also fine.

**Common mistakes**

- Linking to \`{{{url}}}\` on a tag. That property is not set, so the href is empty.
- Linking to \`/tagged/{{name}}\` instead of \`/tagged/{{slug}}\`. Names can contain spaces.
- Wrapping the snippet in \`{{#entry}}\` and then pasting it into a list partial. The outer section never matches.
- Using this pattern when you actually want “all posts with this tag on the current page” — that is \`{{#tagged.Apple}}\` on \`all_entries\`, documented under Examples.`,
  accessibility: `- Wrap the list in \`<nav aria-label="Tags">\` so it is a distinct navigation landmark, not a stray pile of links.
- The link text must be the tag name. Do not replace it with a generic “Tag” label.
- If you add a heading (“Tags”), associate it with the list rather than leaving an empty heading when \`tags.length\` is 0 — the \`{{#tags.length}}\` guard handles that.`,
  related: ["backlinks", "archives-chronological", "task-lists"],
};
