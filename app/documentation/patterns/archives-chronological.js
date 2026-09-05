module.exports = {
  slug: "archives-chronological",
  title: "Chronological archives",
  summary:
    "A newest-first list of {{#all_entries}} on archives.html, optionally preceded by popular tags.",
  category: "Lists",
  sourceTemplates: [
    {
      name: "Text",
      files: ["app/templates/source/text/archives.html"],
    },
    {
      name: "Gallery",
      files: ["app/templates/source/gallery/archives.html"],
    },
    {
      name: "Hypertext",
      files: ["app/templates/source/hypertext/archives.html"],
    },
    {
      name: "Keynote",
      files: ["app/templates/source/keynote/archives.html"],
    },
  ],
  whenToUse:
    "Use this when a year/month outline is more structure than the site needs. It is the right default for a small writing site. Switch to archives grouped by month once scrolling the full list becomes the problem.",
  htmlFile: "archives.html",
  html: `<h1>Archives</h1>

<form class="search-form" action="/search" method="get" role="search">
  <label class="search-form-label" for="search">Search</label>
  <input id="search" type="search" name="q" value="{{query}}" placeholder="Search…" />
</form>

{{#popular_tags.length}}
<nav class="archive-tags" aria-label="Popular tags">
  {{#popular_tags}}
  <a href="/tagged/{{slug}}" {{#active}}aria-current="page"{{/active}}>{{tag}}</a>{{^last}}, {{/last}}
  {{/popular_tags}}
</nav>
{{/popular_tags.length}}

<ol class="archive-list">
  {{#all_entries}}
  <li>
    <a href="{{{url}}}">{{title}}</a>
    {{#date}}<time>{{date}}</time>{{/date}}
  </li>
  {{/all_entries}}
</ol>`,
  cssFile: "style.css",
  css: `.search-form {
  display: flex;
  margin: 0 0 1.25em;
}

.search-form-label {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  clip-path: inset(50%);
}

.search-form input {
  flex: 1;
  font: inherit;
  padding: 0.4em 0;
  border: 0;
  border-bottom: 1px solid currentColor;
  background: transparent;
  color: inherit;
}

.archive-tags {
  margin: 0 0 1.5em;
  font-size: 0.9em;
}

.archive-tags a {
  color: inherit;
}

.archive-list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.archive-list li {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 0.35em 1em;
  margin: 0.4em 0;
}

.archive-list a {
  color: inherit;
}

.archive-list time {
  opacity: 0.55;
}`,
  demoHTML: `<h1>Archives</h1>
<form class="search-form" action="#" method="get" role="search">
  <label class="search-form-label" for="demo-archive-search">Search</label>
  <input id="demo-archive-search" type="search" name="q" placeholder="Search…">
</form>
<nav class="archive-tags" aria-label="Popular tags">
  <a href="#">citrus</a>, <a href="#">travel</a>, <a href="#">notes</a>
</nav>
<ol class="archive-list">
  <li><a href="#">A later harvest</a><time>March 4, 2026</time></li>
  <li><a href="#">Notes on citrus</a><time>March 1, 2026</time></li>
  <li><a href="#">Index of groves</a><time>January 12, 2026</time></li>
</ol>`,
  demoCaption:
    "`all_entries` is every post, newest first. It is not paginated, unlike `{{#posts}}` on the homepage.",
  guidance: `\`all_entries\` is a flat array of every entry, newest first. Text’s archives page is this list plus a search box and \`{{#popular_tags}}\`.

**How to add it**

- Use \`{{#all_entries}}\`, not \`{{#posts}}\` or \`{{#entries}}\`. Those last two are the *current page* of a paginated list.
- \`popular_tags\` is optional. Each item has \`tag\` / \`name\`, \`slug\`, and \`active\`. Text comma-separates them with \`{{^last}}, {{/last}}\`.
- Pair the list with the [search form](/developers/patterns/search-form) so readers who remember a title can jump instead of scrolling.
- Gallery and Hypertext skip the tag cloud and print one link per line. That is enough for a photo index or a wiki sitemap.
- Do not mix this with \`{{#pagination}}\`. If the site is large enough that the full list is painful, use [archives grouped by month](/developers/patterns/archives-by-month) instead of paging \`all_entries\` — Blot does not paginate this array.

**Common mistakes**

- Iterating \`{{#archives}}\` and also \`{{#all_entries}}\` on the same page. Pick one grouping.
- Linking tags to \`/tagged/{{tag}}\` instead of \`/tagged/{{slug}}\`.
- Using this on the homepage. The homepage should stay paginated (\`{{#posts}}\`) so first load stays small.`,
  accessibility: `- An ordered list matches newest-first chronology. If you drop the dates, keep the list — the order is still information.
- Popular tags belong in a \`<nav aria-label="Popular tags">\` so they are not just a sentence of links in the main flow.
- Visually hide the search label; do not omit it.`,
  related: ["archives-by-month", "search-form", "tag-links"],
};
