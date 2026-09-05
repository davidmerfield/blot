module.exports = {
  slug: "search-form",
  title: "Search form",
  summary:
    "A GET form that submits q to /search, prefills {{query}}, and focuses the field on the search page.",
  category: "Search",
  sourceTemplates: [
    {
      name: "Text",
      files: [
        "app/templates/source/text/archives.html",
        "app/templates/source/text/search.html",
      ],
    },
    {
      name: "Blog",
      files: [
        "app/templates/source/blog/archives.html",
        "app/templates/source/blog/search.html",
      ],
    },
    {
      name: "Hypertext",
      files: ["app/templates/source/hypertext/search-form.html"],
    },
    {
      name: "Magazine",
      files: ["app/templates/source/magazine/search_form.html"],
    },
  ],
  whenToUse:
    "Add this whenever the template has a `search.html` view (Blot’s default search route). Put a compact copy in the header or on `archives.html` so readers can search from anywhere.",
  htmlFile: "search.html",
  html: `<form class="search-form" action="/search" method="get" role="search">
  <label class="search-form-label" for="search">Search</label>
  <input
    id="search"
    type="search"
    name="q"
    value="{{query}}"
    placeholder="Search…"
    autocomplete="off"
  />
  <button type="submit">Search</button>
</form>

{{#query}}
  {{^entries}}
  <p class="search-empty">No results for “{{query}}”.</p>
  {{/entries}}
{{/query}}

{{#entries}}
<a class="search-result" href="{{{url}}}">{{title}}</a>
{{/entries}}`,
  cssFile: "style.css",
  css: `.search-form {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5em;
}

.search-form-label {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  clip-path: inset(50%);
  border: 0;
  white-space: nowrap;
}

.search-form input {
  flex: 1 1 12em;
  font: inherit;
  padding: 0.4em 0.6em;
  border: 1px solid currentColor;
  border-radius: 4px;
  background: transparent;
  color: inherit;
}

.search-form button {
  font: inherit;
  padding: 0.4em 0.75em;
  border: 1px solid currentColor;
  border-radius: 4px;
  background: transparent;
  color: inherit;
  cursor: pointer;
}

.search-empty {
  margin: 1em 0;
  opacity: 0.7;
}

.search-result {
  display: block;
  margin: 0.35em 0;
  color: inherit;
}`,
  jsFile: "search.html",
  js: `var search = document.getElementById("search");
if (search) search.focus();`,
  demoHTML: `<form class="search-form" action="#" method="get" role="search">
  <label class="search-form-label" for="demo-search">Search</label>
  <input id="demo-search" type="search" name="q" value="" placeholder="Search…" autocomplete="off">
  <button type="submit">Search</button>
</form>
<p class="search-empty">No results for “lemons”.</p>
<a class="search-result" href="#">Notes on citrus</a>
<a class="search-result" href="#">A later harvest</a>`,
  demoCaption:
    "The live demo stays on this page. In a template, `action=\"/search\"` and `name=\"q\"` are what Blot’s search view expects.",
  guidance: `Blot’s search route is \`GET /search?q=\`. The search view receives \`query\` (the string) and \`entries\` (matching posts).

**How to add it**

- The input **must** be named \`q\`. Any other name is ignored.
- \`action="/search"\` so the same form works on archives, the header, and the search page itself. Blog’s search page omits \`action\` because it is already on \`/search\`; that breaks if you reuse the partial elsewhere.
- Prefill with \`value="{{query}}"\`. On non-search pages \`query\` is empty and the box is blank.
- Focus the field on \`search.html\` only. Use \`autofocus\` (Magazine, Index, Profile) or a one-line script. Do not autofocus a header search on every page.
- Empty state: wrap “No results” in \`{{#query}}{{^entries}}…{{/entries}}{{/query}}\` so it does not show before the reader has searched.
- Register \`search.html\` in the template’s \`package.json\` if it is not already there. The default URL is \`/search\`.

**Common mistakes**

- \`method="post"\`. Search is a GET so the query is bookmarkable.
- Using \`type="text"\` without a visible label or \`placeholder\`. Prefer \`type="search"\` plus a visually hidden \`<label for="search">\`.
- Fetching \`/search?q=…&debug=true\` for a typeahead dropdown (Album, Links). That is a separate, heavier pattern; this one is the form that always works without JavaScript.`,
  accessibility: `- \`role="search"\` on the form makes it a landmark.
- Keep a \`<label for="search">\`. Hiding it visually is fine; omitting it is not. \`placeholder\` is not a label.
- Move focus to the field on the search page so keyboard users can type immediately. Do not steal focus on other pages.
- Announce an empty result with visible text, not only by clearing the list.`,
  related: ["pagination", "archives-chronological", "site-menu-bar"],
};
