module.exports = {
  slug: "keyboard-adjacent",
  title: "Arrow-key next and previous",
  summary:
    "Left and Right arrow keys follow entry.next and entry.previous, matching on-screen arrows, and do nothing while the reader is typing in a field.",
  category: "Scripts",
  sourceTemplates: [
    {
      name: "Album",
      files: ["app/templates/source/album/entry.html"],
    },
    {
      name: "Portfolio",
      files: ["app/templates/source/portfolio/entry.html"],
    },
    {
      name: "Links",
      files: [
        "app/templates/source/links/_entry_layout.html",
        "app/templates/source/links/script.js",
      ],
    },
  ],
  whenToUse:
    "Use this on image, link, or slideshow templates where readers move through posts one at a time. Skip it on long-form essays (arrow keys should scroll) and never bind keys globally on list views.",
  htmlFile: "entry.html",
  html: `{{#entry}}
{{^page}}
<nav class="slideshow-nav" aria-label="Adjacent posts">
  <a {{#next}}href="{{{url}}}"{{/next}} data-adjacent="older" rel="prev">Older</a>
  <a {{#previous}}href="{{{url}}}"{{/previous}} data-adjacent="newer" rel="next">Newer</a>
</nav>
{{/page}}
{{/entry}}`,
  cssFile: "style.css",
  css: `.slideshow-nav {
  display: flex;
  justify-content: space-between;
  gap: 1em;
  margin: 1.5em 0 0;
}

.slideshow-nav a {
  color: inherit;
}

.slideshow-nav a:not([href]) {
  visibility: hidden;
}`,
  jsFile: "script.js",
  js: `document.addEventListener("keydown", function (event) {
  if (event.defaultPrevented) return;
  if (event.metaKey || event.ctrlKey || event.altKey) return;

  var active = document.activeElement;
  var tag = active && active.tagName;
  if (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    (active && active.isContentEditable)
  ) {
    return;
  }

  var older = document.querySelector("[data-adjacent='older'][href]");
  var newer = document.querySelector("[data-adjacent='newer'][href]");

  if (event.key === "ArrowLeft" && older) {
    window.location = older.href;
  }
  if (event.key === "ArrowRight" && newer) {
    window.location = newer.href;
  }
});`,
  demoJS: `root.setAttribute("tabindex", "0");
var status = root.querySelector(".keyboard-status");

function announce(href) {
  if (status) status.textContent = "Would open " + href;
}

root.addEventListener("click", function (event) {
  if (event.target.closest("input, textarea, select, button, a")) return;
  root.focus();
});

root.querySelectorAll("a[href]").forEach(function (link) {
  link.addEventListener("click", function (event) {
    event.preventDefault();
    announce(link.getAttribute("href"));
  });
});

root.addEventListener("keydown", function (event) {
  if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
  var active = document.activeElement;
  var tag = active && active.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
  event.preventDefault();
  var older = root.querySelector("[data-adjacent='older'][href]");
  var newer = root.querySelector("[data-adjacent='newer'][href]");
  if (event.key === "ArrowLeft" && older) announce(older.getAttribute("href"));
  if (event.key === "ArrowRight" && newer) announce(newer.getAttribute("href"));
});`,
  demoHTML: `<p class="keyboard-status">Click this demo, then press ← or →. Typing in a field must not navigate.</p>
<nav class="slideshow-nav" aria-label="Adjacent posts">
  <a href="#older" data-adjacent="older" rel="prev">Older</a>
  <a href="#newer" data-adjacent="newer" rel="next">Newer</a>
</nav>
<label>Try a field <input type="text" placeholder="arrows should not leave"></label>`,
  demoCaption:
    "Album, Portfolio, and Links map Left to `next` (newer) and Right to `previous` (older). The demo reports the URL instead of leaving the docs.",
  guidance: `Album and Portfolio inline this in \`entry.html\`:

\`\`\`js
var nextURL = "{{{entry.next.url}}}";
var previousURL = "{{{entry.previous.url}}}";
if (previousURL && e.keyCode == "39") window.location = previousURL;
if (nextURL && e.keyCode == "37") window.location = nextURL;
\`\`\`

That works, but it overwrites \`document.onkeydown\` and uses deprecated \`keyCode\`. The snippet above reads the same two URLs from the markup, uses \`addEventListener\`, and ignores keys while a field is focused (Links already does this for its search box).

**Direction**

In Blot, \`previous\` is the older sibling and \`next\` is the newer sibling. Album paints ← on \`next\` and → on \`previous\`. **Keep keyboard and on-screen arrows in agreement.** If you label the links “Older / Newer”, map Left → older (\`next\`) and Right → newer (\`previous\`) as above.

**How to add it**

- Only include the script on \`entry.html\`, and only for posts (\`{{^page}}\`).
- Give each arrow \`data-adjacent\` plus \`href\` only when the sibling exists. A missing \`href\` is the first/last post; the CSS hides that control.
- Pair with [adjacent posts](/developers/patterns/adjacent-posts) if you also want titled links at the bottom of the essay.
- Do not attach this handler on \`entries.html\`. Arrow keys should scroll the index.

**Common mistakes**

- \`document.onkeydown = …\`, which wipes other listeners (search typeahead, close-as-back).
- Navigating when \`activeElement\` is an input. Links special-cases this; Album does not.
- Inverting the arrows relative to the visible controls.`,
  accessibility: `- Visible links must exist. Keyboard shortcuts are an extra, not a replacement. Without JavaScript the arrows still work as ordinary links.
- Do not capture keys when focus is in a text field, select, or contenteditable region.
- Prefer \`event.key\` (\`ArrowLeft\` / \`ArrowRight\`) over \`keyCode\`.
- If you hide a missing sibling with \`visibility: hidden\`, keep the element so the layout does not jump; omit \`href\` so it is not tabbable.`,
  related: ["adjacent-posts", "pagination"],
};
