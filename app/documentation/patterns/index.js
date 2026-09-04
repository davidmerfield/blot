const highlight = require("highlight.js");
const { marked } = require("marked");

const PATTERNS = [
  require("./site-menu-bar"),
  require("./hamburger-navigation"),
  require("./pagination"),
  require("./adjacent-posts"),
  require("./archives-by-month"),
  require("./archives-chronological"),
  require("./search-form"),
  require("./tag-links"),
  require("./backlinks"),
  require("./details-disclosure"),
  require("./task-lists"),
  require("./code-copy-button"),
  require("./heading-permalinks"),
  require("./relative-dates"),
  require("./keyboard-adjacent"),
];

const REQUIRED_FIELDS = [
  "slug",
  "title",
  "summary",
  "category",
  "whenToUse",
  "html",
  "css",
  "guidance",
  "accessibility",
  "demoHTML",
];

function escapeHTML(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function highlightCode(code, lang) {
  if (!code) return "";
  const langs = [lang, "xml", "html"].filter(Boolean);
  for (let i = 0; i < langs.length; i++) {
    try {
      return highlight.highlight(langs[i], code).value;
    } catch (e) {}
  }
  return escapeHTML(code);
}

// Prefix every selector so live demos cannot leak into the rest of the docs.
// Leaves @media/@keyframes wrappers intact and still scopes the rules inside them.
function scopeCSS(css, scope) {
  if (!css) return "";
  return css.replace(/([^{}]+)\{/g, function (match, selectors) {
    const leading = selectors.match(/^\s*/);
    const trimmed = selectors.trim();
    if (!trimmed || trimmed.startsWith("@")) {
      return match;
    }
    const scoped = trimmed
      .split(",")
      .map(function (selector) {
        selector = selector.trim();
        if (!selector || selector.startsWith(scope)) return selector;
        return scope + " " + selector;
      })
      .join(", ");
    return (leading ? leading[0] : "") + scoped + " {";
  });
}

function all() {
  return PATTERNS.slice();
}

function get(slug) {
  return PATTERNS.find((pattern) => pattern.slug === slug) || null;
}

function categories() {
  const seen = [];
  for (const pattern of PATTERNS) {
    if (!seen.includes(pattern.category)) seen.push(pattern.category);
  }
  return seen;
}

function toAgentMarkdown(pattern) {
  const sources = (pattern.sourceTemplates || [])
    .map((source) => {
      const files = (source.files || []).map((file) => `- \`${file}\``).join("\n");
      return `### ${source.name}\n${files}`;
    })
    .join("\n\n");

  const related = (pattern.related || [])
    .map((slug) => `- /developers/patterns/${slug}`)
    .join("\n");

  const markdownBlock = pattern.markdown
    ? `## Markdown authors write\n\nSuggested file: \`${pattern.markdownFile || "post.md"}\`\n\n\`\`\`md\n${pattern.markdown.trim()}\n\`\`\`\n`
    : "";

  const jsBlock = pattern.js
    ? `## JavaScript\n\nSuggested file: \`${pattern.jsFile || "script.js"}\`\n\n\`\`\`js\n${pattern.js.trim()}\n\`\`\`\n`
    : "";

  return `# Blot template design pattern: ${pattern.title}

Use this pattern when working on a Blot template. Blot templates are Mustache. Do not add SCSS, subdirectories for views, or JavaScript unless the pattern explicitly requires it.

${pattern.summary}

## When to use

${pattern.whenToUse}

## HTML

Suggested file: \`${pattern.htmlFile || "entry.html"}\`

\`\`\`html
${pattern.html.trim()}
\`\`\`

## CSS

Suggested file: \`${pattern.cssFile || "style.css"}\`

\`\`\`css
${pattern.css.trim()}
\`\`\`

${jsBlock}${markdownBlock}## Implementation guidance

${pattern.guidance}

## Accessibility

${pattern.accessibility}

${sources ? `## Source templates\n\n${sources}\n` : ""}## Verify

- Make the change, wait for the folder to sync, then reload the site.
- Append \`?json=true\` to inspect the render context (\`menu\`, \`tags\`, \`entry.html\`, etc.).
- Check the small-screen layout and the no-JS path.
- Keep the change minimal: prefer this HTML/CSS over a new library.

Docs: https://blot.im/developers/patterns/${pattern.slug}
Raw: https://blot.im/developers/patterns/${pattern.slug}.md
${related ? `\n## Related patterns\n\n${related}\n` : ""}`.trim();
}

function toCatalogMarkdown() {
  const index = PATTERNS.map(
    (pattern) =>
      `- [${pattern.title}](/developers/patterns/${pattern.slug}.md) — ${pattern.summary}`
  ).join("\n");

  return `# Blot template design patterns

This library is for agents and people editing Blot templates. Each pattern is copy-pasteable HTML/CSS with guidance, plus JavaScript when the feature needs it. Constraints: Mustache only, no SCSS, no view subdirectories, prefer no JavaScript unless the pattern includes a script.

${index}

---

${PATTERNS.map(toAgentMarkdown).join("\n\n---\n\n")}
`;
}

function toJSON(pattern) {
  return {
    slug: pattern.slug,
    title: pattern.title,
    summary: pattern.summary,
    category: pattern.category,
    url: "/developers/patterns/" + pattern.slug,
    markdownURL: "/developers/patterns/" + pattern.slug + ".md",
    htmlFile: pattern.htmlFile || null,
    cssFile: pattern.cssFile || null,
    jsFile: pattern.js ? pattern.jsFile || "script.js" : null,
    markdownFile: pattern.markdownFile || null,
    html: pattern.html.trim(),
    css: pattern.css.trim(),
    js: pattern.js ? pattern.js.trim() : null,
    markdown: pattern.markdown ? pattern.markdown.trim() : null,
    whenToUse: pattern.whenToUse,
    guidance: pattern.guidance,
    accessibility: pattern.accessibility,
    sourceTemplates: pattern.sourceTemplates || [],
    related: pattern.related || [],
  };
}

function wrapDemoJS(slug, demoJS) {
  if (!demoJS || !String(demoJS).trim()) return "";
  const selector = JSON.stringify(".pattern-demo--" + slug);
  return (
    "<script>\n(function (root) {\n  if (!root) return;\n" +
    String(demoJS).trim() +
    "\n})(document.querySelector(" +
    selector +
    "));\n</script>"
  );
}

function present(pattern) {
  const htmlLang = pattern.html.includes("{{") ? "handlebars" : "html";
  const js = pattern.js ? pattern.js.trim() : "";
  return {
    ...pattern,
    html: pattern.html.trim(),
    css: pattern.css.trim(),
    js,
    markdown: pattern.markdown ? pattern.markdown.trim() : "",
    hasMarkdown: Boolean(pattern.markdown),
    hasJS: Boolean(js),
    jsFile: pattern.jsFile || "script.js",
    htmlHighlighted: highlightCode(pattern.html.trim(), htmlLang),
    cssHighlighted: highlightCode(pattern.css.trim(), "css"),
    jsHighlighted: js ? highlightCode(js, "javascript") : "",
    markdownHighlighted: pattern.markdown
      ? highlightCode(pattern.markdown.trim(), "markdown")
      : "",
    guidanceHTML: marked.parse(pattern.guidance),
    accessibilityHTML: marked.parse(pattern.accessibility),
    whenToUseHTML: marked.parse(pattern.whenToUse),
    agentMarkdown: toAgentMarkdown(pattern),
    relatedPatterns: (pattern.related || [])
      .map(get)
      .filter(Boolean)
      .map((related) => ({
        slug: related.slug,
        title: related.title,
        summary: related.summary,
      })),
    sourceTemplates: (pattern.sourceTemplates || []).map((source) => ({
      name: source.name,
      files: (source.files || []).map((path) => ({ path })),
    })),
    demoCSS: scopeCSS(pattern.css.trim(), ".pattern-demo--" + pattern.slug),
    demoStyleTag:
      "<style>\n" +
      scopeCSS(pattern.css.trim(), ".pattern-demo--" + pattern.slug) +
      "\n</style>",
    demoScriptTag: wrapDemoJS(pattern.slug, pattern.demoJS),
  };
}

function grouped() {
  return categories().map((category) => ({
    category,
    categorySlug: category
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, ""),
    patterns: PATTERNS.filter((pattern) => pattern.category === category).map(
      (pattern) => ({
        slug: pattern.slug,
        title: pattern.title,
        summary: pattern.summary,
        category: pattern.category,
      })
    ),
  }));
}

function validate(pattern) {
  const missing = REQUIRED_FIELDS.filter((field) => !pattern[field]);
  return missing;
}

module.exports = {
  REQUIRED_FIELDS,
  all,
  get,
  categories,
  grouped,
  present,
  toAgentMarkdown,
  toCatalogMarkdown,
  toJSON,
  validate,
  highlightCode,
  scopeCSS,
  wrapDemoJS,
};
