module.exports = {
  slug: "site-menu-bar",
  title: "Site menu bar",
  summary:
    "Render the dashboard {{#menu}} list as a simple row of links, marking the current page with {{active}}.",
  category: "Navigation",
  sourceTemplates: [
    {
      name: "Blog",
      files: ["app/templates/source/blog/_sidebar.html"],
    },
    {
      name: "Index",
      files: ["app/templates/source/index/_header.html"],
    },
    {
      name: "Journal",
      files: [
        "app/templates/source/journal/header.html",
        "app/templates/source/journal/style.css",
      ],
    },
    {
      name: "Profile",
      files: ["app/templates/source/profile/_navigation.html"],
    },
  ],
  whenToUse:
    "Start here for any template whose navigation is a short list of dashboard links. Use this instead of a hamburger when the menu fits on one row, or as the inner markup of a collapsing header. Skip it only if tags or a folder tree are the primary navigation.",
  htmlFile: "_header.html",
  html: `<header class="site-header">
  <a class="site-title" href="/">{{title}}</a>
  <nav class="site-nav" aria-label="Site">
    {{#menu}}
    <a href="{{{url}}}" class="{{active}}">{{label}}</a>
    {{/menu}}
  </nav>
</header>`,
  cssFile: "style.css",
  css: `.site-header {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.75em 1.5em;
}

.site-title {
  color: inherit;
  text-decoration: none;
  font-weight: 600;
}

.site-nav {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75em 1.25em;
}

.site-nav a {
  color: inherit;
  text-decoration: none;
  opacity: 0.65;
}

.site-nav a:hover,
.site-nav a:focus-visible,
.site-nav a.active {
  opacity: 1;
}

.site-nav a.active {
  text-decoration: underline;
  text-underline-offset: 0.2em;
}`,
  demoHTML: `<header class="site-header">
  <a class="site-title" href="#">Site title</a>
  <nav class="site-nav" aria-label="Site">
    <a href="#" class="active">Home</a>
    <a href="#">Archives</a>
    <a href="#">Search</a>
    <a href="#">About</a>
  </nav>
</header>`,
  demoCaption:
    "The current page uses the `active` class Blot sets on the matching menu item.",
  guidance: `Every Blot site exposes \`{{#menu}}\`: dashboard links plus any entry with menu metadata. Each item has \`label\`, \`{{{url}}}\`, \`{{active}}\`, \`{{first}}\`, and \`{{last}}\`.

**How to add it**

- Put the markup in the header partial (\`_header.html\`, \`header.html\`, or \`_navigation.html\`) so every view shares it.
- Use \`{{{url}}}\` (unescaped) so paths with slashes survive. Use \`{{label}}\` (escaped) for the text.
- \`{{active}}\` is the string \`"active"\` on the current page and empty otherwise. Putting it in \`class="{{active}}"\` is enough; do not write \`{{#active}}active{{/active}}\`.
- Profile styles the last item as a call-to-action with \`{{#last}} cta {{/last}}\`. That is optional.
- If the row will wrap on small screens, switch to [hamburger navigation](/developers/patterns/hamburger-navigation) instead of adding a JavaScript dropdown.

**Common mistakes**

- Linking with \`{{url}}\` instead of \`{{{url}}}\`. The slashes become \`<span>\` entities and the menu 404s.
- Hard-coding Home / Archives / Search. Those belong on the dashboard Links page so authors can change them without editing the template.
- Building a second menu from \`{{#recent_entries}}\` and calling it navigation. That is a list of posts, not \`{{#menu}}\`.`,
  accessibility: `- Wrap the links in \`<nav aria-label="Site">\` so the menu is a landmark, distinct from tag lists or breadcrumbs.
- The current page should be perceivable without color alone. \`{{active}}\` plus underline (or \`aria-current="page"\` if you add it in CSS/JS) is enough.
- Keep the site title as a link to \`/\`. Do not make the whole header one giant link.`,
  related: ["hamburger-navigation", "search-form", "pagination"],
};
