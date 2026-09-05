module.exports = {
  slug: "archives-by-month",
  title: "Archives grouped by month",
  summary:
    "List every post on archives.html, grouped with {{#archives}} into year and month headings.",
  category: "Lists",
  sourceTemplates: [
    {
      name: "Journal",
      files: ["app/templates/source/journal/archives.html"],
    },
    {
      name: "Index",
      files: ["app/templates/source/index/archives.html"],
    },
    {
      name: "Magazine",
      files: ["app/templates/source/magazine/archives.html"],
    },
    {
      name: "Blog",
      files: ["app/templates/source/blog/archives.html"],
    },
  ],
  whenToUse:
    "Use this on `archives.html` when you want a dated index rather than a paginated homepage. Prefer it over a flat list once the site has more than a couple of dozen posts. See chronological archives if you want a single newest-first list instead.",
  htmlFile: "archives.html",
  html: `<h1>Archives</h1>

{{#archives}}
<section class="archive-year">
  <h2>{{year}} <span class="archive-count">({{total}} post{{s}})</span></h2>
  {{#months}}
  <section class="archive-month">
    <h3>{{month}}</h3>
    <ul>
      {{#entries}}
      <li>
        <a href="{{{url}}}">{{title}}</a>
        {{#date}}<time>{{date}}</time>{{/date}}
      </li>
      {{/entries}}
    </ul>
  </section>
  {{/months}}
</section>
{{/archives}}

{{^archives.length}}
<p>Nothing published yet.</p>
{{/archives.length}}`,
  cssFile: "style.css",
  css: `.archive-year {
  margin: 0 0 2em;
}

.archive-year h2,
.archive-month h3 {
  margin: 0 0 0.5em;
  font-size: 1em;
}

.archive-count {
  font-weight: 400;
  opacity: 0.55;
}

.archive-month {
  margin: 0 0 1.25em;
}

.archive-month ul {
  list-style: none;
  margin: 0;
  padding: 0;
}

.archive-month li {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35em 0.75em;
  margin: 0.25em 0;
}

.archive-month a {
  color: inherit;
}

.archive-month time {
  opacity: 0.55;
}`,
  demoHTML: `<h1>Archives</h1>
<section class="archive-year">
  <h2>2026 <span class="archive-count">(3 posts)</span></h2>
  <section class="archive-month">
    <h3>March</h3>
    <ul>
      <li><a href="#">A later harvest</a><time>March 4</time></li>
      <li><a href="#">Notes on citrus</a><time>March 1</time></li>
    </ul>
  </section>
  <section class="archive-month">
    <h3>January</h3>
    <ul>
      <li><a href="#">Index of groves</a><time>January 12</time></li>
    </ul>
  </section>
</section>`,
  demoCaption:
    "`{{s}}` is the letter “s” when the year has more than one post, so “1 post” / “3 posts” works without extra logic.",
  guidance: `\`archives\` is a list of years. Each year has \`year\`, \`total\`, \`s\` (the letter “s” when \`total !== 1\`), and \`months\`. Each month has \`month\` (a label) and \`entries\` (full entry objects).

**How to add it**

- Create \`archives.html\` and route it to \`/archives\` in \`package.json\` if the view is not already there.
- Journal and the [reference example](/developers/reference#archives) print \`{{year}}\` then \`{{month}}\` then the entries. Index prints \`{{month}} {{year}}\` on one line. Blog skips the headings and just walks \`{{#archives}}{{#months}}{{#entries}}\`.
- \`{{s}}\` is for English pluralization only: \`{{total}} post{{s}}\`. For other languages, write the word in full or skip the count.
- Empty site: Magazine uses \`{{^archives.length}}\`. Include that so a new site is not a blank page.
- This list is **not paginated**. Do not wrap it in \`{{#pagination}}\`.
- A search form above the list (Blog, Text) is a good companion; see [search form](/developers/patterns/search-form).

**Common mistakes**

- Iterating \`{{#entries}}\` at the top level of \`archives.html\`. That variable is the *current page* of the homepage, not the full archive.
- Using \`{{#all_entries}}\` here. That is the other archives variant: one flat list, no year/month groupings.
- Forgetting \`{{{url}}}\` on each permalink.`,
  accessibility: `- Keep the year and month as headings so the page is a navigable outline, not a flat pile of links.
- Nested \`<section>\` plus headings is enough; you do not need extra ARIA on a static index.
- Dates in \`<time>\` may omit a machine \`datetime\` if you only have \`{{date}}\`. Adding \`{{#formatDate}}YYYY-MM-DD{{/formatDate}}\` is nicer when you want it.`,
  related: ["archives-chronological", "search-form", "pagination"],
};
