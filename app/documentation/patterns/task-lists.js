module.exports = {
  slug: "task-lists",
  title: "GitHub-style task lists",
  summary:
    "Style the HTML Blot emits for Markdown task lists (- [ ] / - [x]) so checklists read as checklists, not bullets.",
  category: "Content",
  sourceTemplates: [
    {
      name: "Album",
      files: ["app/templates/source/album/style.css"],
    },
    {
      name: "Text",
      files: ["app/templates/source/text/style.css"],
    },
    {
      name: "Journal",
      files: ["app/templates/source/journal/style.css"],
    },
    {
      name: "Links",
      files: ["app/templates/source/links/style.css"],
    },
  ],
  whenToUse:
    "Add this CSS whenever the template might render Markdown (or other converters) that include GitHub-style task list items. Skip it only if the template never shows entry HTML.",
  htmlFile: "entry.html",
  html: `{{#entry}}
<div class="entry-body">
  {{{html}}}
</div>
{{/entry}}`,
  cssFile: "style.css",
  css: `ul.task-list {
  list-style-type: none;
  padding-left: 0;
}

ul.task-list li {
  display: flex;
  align-items: flex-start;
  gap: 0.5em;
}

ul.task-list input[type="checkbox"] {
  margin: 0.35em 0 0;
  flex-shrink: 0;
}

ul.task-list label {
  flex: 1;
}`,
  markdownFile: "post.md",
  markdown: `- [ ] Draft the outline
- [x] Gather references
- [ ] Write the first section`,
  demoHTML: `<ul class="task-list">
<li><label><input type="checkbox"> Draft the outline</label></li>
<li><label><input type="checkbox" checked> Gather references</label></li>
<li><label><input type="checkbox"> Write the first section</label></li>
</ul>`,
  demoCaption:
    "This is the HTML Pandoc emits for `- [ ]` / `- [x]` lists. The template only supplies CSS.",
  guidance: `Authors write GitHub-style task lists in Markdown:

\`\`\`md
- [ ] Incomplete task
- [x] Completed task
\`\`\`

Blot’s Markdown converter (Pandoc) turns that into:

\`\`\`html
<ul class="task-list">
<li><label><input type="checkbox" />Incomplete task</label></li>
<li><label><input type="checkbox" checked="" />Completed task</label></li>
</ul>
\`\`\`

The template does not generate this markup. \`{{{html}}}\` (or \`{{{body}}}\`) already contains it. Your job is to style \`ul.task-list\` so the items do not show a bullet *and* a checkbox.

**How to add it**

- Put the CSS in \`style.css\`. Most of Blot’s bundled templates only set \`list-style-type: none\`; the extra flex alignment above is optional.
- Do not wrap checkboxes in extra JavaScript. Checking a box on the live site will not edit the source file in Dropbox, Git, or Google Drive.
- If you want the boxes to be visibly read-only, you can add \`pointer-events: none\` — but leave the \`checked\` attribute alone so completed items still look completed.
- Keep \`{{{html}}}\` unescaped. If you use \`{{html}}\`, the list markup will show up as text.

**Common mistakes**

- Re-implementing checkboxes in the template with Mustache. The list lives in the entry HTML.
- Styling \`input[type="checkbox"]\` globally and accidentally restyling dashboard-unrelated controls in the same template. Scope with \`ul.task-list\`.
- Forgetting that Word documents and other converters may not emit \`task-list\` class names. This pattern is for Markdown (and any converter that emits the same HTML).`,
  accessibility: `- The converter already wraps each checkbox and its text in a \`<label>\`, so the text is the accessible name. Do not strip the \`<label>\` in CSS or with a post-processor.
- If you disable pointer events to prevent toggling, the checkbox is still exposed to assistive tech as a checkbox. That is acceptable for a published, static checklist.
- Do not replace the native checkbox with a CSS-only box unless you also keep the real input available to assistive tech (visually hidden, not \`display: none\`).`,
  related: ["details-disclosure", "tag-links"],
};
