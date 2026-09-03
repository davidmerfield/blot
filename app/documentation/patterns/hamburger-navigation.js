module.exports = {
  slug: "hamburger-navigation",
  title: "Pure CSS hamburger navigation",
  summary:
    "Collapse site navigation behind a hamburger control using a checkbox and label, with no JavaScript.",
  category: "Navigation",
  sourceTemplates: [
    {
      name: "Album",
      files: [
        "app/templates/source/album/_navigation.html",
        "app/templates/source/album/style.css",
      ],
    },
    {
      name: "Text",
      files: [
        "app/templates/source/text/_header.html",
        "app/templates/source/text/style.css",
      ],
    },
    {
      name: "Studio",
      files: [
        "app/templates/source/studio/_header.html",
        "app/templates/source/studio/style.css",
      ],
    },
  ],
  whenToUse:
    "Use this when the template has a `{{#menu}}` list that should sit in one row on wide screens and collapse to a tap target on small screens. Prefer it over a JavaScript dropdown so the menu still works if `script.js` is missing or blocked.",
  htmlFile: "_header.html",
  html: `<input
  class="nav-toggle"
  type="checkbox"
  id="nav-toggle"
  aria-controls="site-nav"
/>
<header class="site-header">
  <a class="site-title" href="/">{{title}}</a>
  <label class="nav-toggle-label" for="nav-toggle">
    <span class="nav-toggle-sr">Menu</span>
    <span class="nav-toggle-icon" aria-hidden="true"></span>
  </label>
  <nav class="site-nav" id="site-nav" aria-label="Site">
    {{#menu}}
    <a href="{{{url}}}" class="{{active}}">{{label}}</a>
    {{/menu}}
  </nav>
</header>`,
  cssFile: "style.css",
  css: `.site-header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  position: relative;
  height: 2.5em;
  overflow: hidden;
}

.site-title {
  white-space: nowrap;
  color: inherit;
  text-decoration: none;
}

.nav-toggle {
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

.nav-toggle-label {
  display: flex;
  align-items: center;
  justify-content: center;
  position: absolute;
  top: 0;
  right: 0;
  width: 2.5em;
  height: 2.5em;
  cursor: pointer;
  z-index: 2;
}

.nav-toggle-sr {
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

.nav-toggle-icon,
.nav-toggle-icon::before,
.nav-toggle-icon::after {
  display: block;
  width: 1.25em;
  height: 2px;
  background: currentColor;
  transition: transform 0.2s ease, opacity 0.2s ease;
}

.nav-toggle-icon {
  position: relative;
}

.nav-toggle-icon::before,
.nav-toggle-icon::after {
  content: "";
  position: absolute;
  left: 0;
}

.nav-toggle-icon::before {
  top: -6px;
}

.nav-toggle-icon::after {
  top: 6px;
}

.site-nav {
  display: flex;
  flex-wrap: wrap;
  gap: 1em;
  width: 100%;
}

.site-nav a {
  color: inherit;
  text-decoration: none;
}

.nav-toggle:checked ~ .site-header {
  height: auto;
  overflow: visible;
}

.nav-toggle:checked ~ .site-header .site-nav {
  flex-direction: column;
  align-items: flex-start;
  padding: 0.75em 0 0.25em;
}

.nav-toggle:checked ~ .site-header .nav-toggle-icon {
  transform: rotate(45deg);
}

.nav-toggle:checked ~ .site-header .nav-toggle-icon::before {
  top: 0;
  transform: rotate(90deg);
}

.nav-toggle:checked ~ .site-header .nav-toggle-icon::after {
  top: 0;
  opacity: 0;
}

.nav-toggle:focus-visible ~ .site-header .nav-toggle-label {
  outline: 2px solid currentColor;
  outline-offset: 2px;
}`,
  demoHTML: `<input class="nav-toggle" type="checkbox" id="demo-nav-toggle" aria-controls="demo-site-nav">
<header class="site-header">
  <a class="site-title" href="#">Site title</a>
  <label class="nav-toggle-label" for="demo-nav-toggle">
    <span class="nav-toggle-sr">Menu</span>
    <span class="nav-toggle-icon" aria-hidden="true"></span>
  </label>
  <nav class="site-nav" id="demo-site-nav" aria-label="Site">
    <a href="#">Home</a>
    <a href="#">Archives</a>
    <a href="#">Search</a>
    <a href="#">About</a>
  </nav>
</header>`,
  demoCaption:
    "The frame is narrow on purpose so the links wrap under the title and stay clipped until you open the menu.",
  guidance: `This is the checkbox-and-label pattern used by Blot’s Album, Text, and Studio templates.

**How it works**

1. A visually hidden checkbox sits immediately before the \`<header>\`.
2. The header has a fixed height and \`overflow: hidden\`. Menu links that wrap onto a second row are clipped.
3. A \`<label for="nav-toggle">\` is the click/tap target. It contains a screen-reader-only “Menu” string and three bars drawn with a pseudo-element.
4. The adjacent-sibling selector \`.nav-toggle:checked ~ .site-header\` raises the header height to \`auto\`, so the wrapped links become visible. The bars rotate into an ×.

**How to add it to a template**

- Put the markup in the header partial (\`_header.html\` or \`_navigation.html\`) and the CSS in \`style.css\`.
- Keep using \`{{#menu}}\` / \`{{label}}\` / \`{{{url}}}\` / \`{{active}}\` so dashboard menu items appear automatically.
- Use a unique \`id\` / \`for\` pair per page. If the header is a partial included on every view, one pair is enough.
- Do not add a \`script.js\` click handler for this. The point of the pattern is that it works with CSS alone.
- On templates with a left or right sidebar (Text), hide the hamburger when the sidebar is visible and show it again in the small-screen media query. See \`app/templates/source/text/style.css\`.

**Common mistakes**

- Putting the checkbox *inside* the header. The \`~\` sibling selector will not match.
- Using \`display: none\` on the checkbox instead of clipping it. A \`display: none\` control cannot receive keyboard focus.
- Giving the label no accessible name. Keep the \`.nav-toggle-sr\` text, or set \`aria-label\` on the checkbox as Zine does.
- Introducing SCSS, a submenu library, or a second copy of the header with a different \`id\`.`,
  accessibility: `- The checkbox is clipped, not removed, so it can still receive focus. Pair that with \`:focus-visible ~ .site-header .nav-toggle-label\` so the visible control shows a focus ring.
- The label’s screen-reader text must describe the action (“Menu”). Decorative bars are \`aria-hidden="true"\`.
- \`aria-controls\` points at the \`<nav>\` id.
- Menu links must remain in the DOM (do not \`display: none\` them on small screens if you can clip them instead) so they stay in the tab order once the menu is open.
- Do not rely on hover. The control must work with click, tap, and Enter/Space on the focused checkbox.`,
  related: ["details-disclosure"],
};
