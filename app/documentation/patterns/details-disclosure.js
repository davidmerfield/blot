module.exports = {
  slug: "details-disclosure",
  title: "Expanding details sections",
  summary:
    "Use native <details> and <summary> for expandable sections in a template or in post HTML, with a custom marker if you want.",
  category: "Content",
  sourceTemplates: [
    {
      name: "Documentation site (pricing page)",
      files: ["app/views/pricing.html"],
    },
  ],
  whenToUse:
    "Use this for FAQs, optional asides, transcripts, or any block that should start collapsed. Prefer native disclosure over a JavaScript accordion. Do not use it as a substitute for site navigation (see hamburger navigation).",
  htmlFile: "entry.html",
  html: `<details class="disclosure">
  <summary>More information</summary>
  <div class="disclosure-body">
    Hidden until the reader opens the section.
  </div>
</details>`,
  cssFile: "style.css",
  css: `.disclosure {
  margin: 0 0 0.75em;
}

.disclosure summary {
  list-style: none;
  cursor: pointer;
  position: relative;
  font-weight: 600;
  padding-left: 1.25em;
}

.disclosure summary::-webkit-details-marker {
  display: none;
}

.disclosure summary::before {
  content: "";
  position: absolute;
  left: 0;
  top: 0.35em;
  width: 0.5em;
  height: 0.5em;
  border-right: 2px solid currentColor;
  border-bottom: 2px solid currentColor;
  transform: rotate(-45deg);
  transform-origin: center;
  transition: transform 0.15s ease;
  opacity: 0.6;
}

.disclosure[open] summary::before {
  transform: rotate(45deg);
}

.disclosure-body {
  margin: 0.5em 0 0 1.25em;
}`,
  markdownFile: "post.md",
  markdown: `<details class="disclosure">
<summary>More information</summary>

<div class="disclosure-body">

Hidden until the reader opens the section. Markdown inside the details block is fine as long as you leave a blank line after \`<summary>\`.

</div>
</details>`,
  demoHTML: `<details class="disclosure">
  <summary>Ingredients</summary>
  <div class="disclosure-body">
    <p>Flour, water, salt, and time.</p>
  </div>
</details>
<details class="disclosure">
  <summary>Method</summary>
  <div class="disclosure-body">
    <p>Mix, rest, bake.</p>
  </div>
</details>`,
  demoCaption: "Native disclosure: the browser keeps open state, keyboard support, and print behavior.",
  guidance: `Blot does not need a custom accordion component. The HTML \`<details>\` element already expands and collapses, works without JavaScript, and can live in two places:

**In the template** — wrap chrome that should start closed (a long archives note, a debug table, “how this page is sorted”). Put the CSS in \`style.css\`.

**In a post** — authors can paste the same markup into Markdown. Pandoc will pass raw HTML through. Use \`class="disclosure"\` on \`<details>\` and wrap the body in \`<div class="disclosure-body">\` so the template CSS applies. Leave a blank line after \`<summary>\` if the body should be parsed as Markdown.

**How to add it**

- Do not add a click handler. \`<summary>\` is the control.
- Hide the default triangle with \`list-style: none\` and \`::-webkit-details-marker { display: none }\`, then draw your own \`summary::before\` if you want a custom marker.
- Use \`[open]\` to style the expanded state. That attribute is also how you default a section to open: \`<details open>\`.
- Keep the summary text meaningful when collapsed. “More” is a poor label; “Ingredients” is a good one.
- Nested \`<details>\` work. Avoid putting interactive elements (links, inputs) inside \`<summary>\` — the summary is already a control.

**When not to use it**

- Site-wide navigation (use the hamburger pattern).
- Content that must be visible to search engines *and* to users who never click — put that in the main flow.
- Callouts. Blot already has a [callout syntax](/developers/guides/customize-callouts) with optional foldable state (\`.callout.is-collapsed\`).`,
  accessibility: `- \`<details>\` / \`<summary>\` give you a button-like control, expanded/collapsed state, and keyboard support (Enter/Space) without ARIA.
- If you hide the default marker, keep a visible indicator (\`::before\` caret or similar) so the control still looks expandable.
- Do not set \`display: none\` on \`summary\` or replace it with a custom \`<div>\` that you click via JavaScript.
- The first line of the summary is the accessible name. Keep it short and specific.`,
  related: ["hamburger-navigation", "task-lists"],
};
