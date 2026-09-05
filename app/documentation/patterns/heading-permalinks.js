module.exports = {
  slug: "heading-permalinks",
  title: "Heading permalinks",
  summary:
    "Add a hover link on entry headings that copies the page URL plus the heading id, with a toast on success.",
  category: "Scripts",
  sourceTemplates: [
    {
      name: "Hypertext",
      files: [
        "app/templates/source/hypertext/heading.js",
        "app/templates/source/hypertext/heading-anchor.css",
      ],
    },
  ],
  whenToUse:
    "Use this on long entries (guides, wikis, notes) where readers quote a section. Skip it if headings do not have ids, or if the template is image-first and rarely has headings.",
  htmlFile: "entry.html",
  html: `{{#entry}}
<div class="entry">
  {{{html}}}
</div>
{{/entry}}`,
  cssFile: "style.css",
  css: `.heading-anchor {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin-left: 0.35em;
  width: 1em;
  height: 1em;
  font-size: 0.85em;
  line-height: 1;
  color: inherit;
  text-decoration: none;
  opacity: 0;
}

.entry h1:hover .heading-anchor,
.entry h2:hover .heading-anchor,
.entry h3:hover .heading-anchor,
.entry h4:hover .heading-anchor,
.entry h5:hover .heading-anchor,
.entry h6:hover .heading-anchor,
.heading-anchor:focus-visible {
  opacity: 0.55;
}

.heading-anchor:hover,
.heading-anchor:focus-visible {
  opacity: 1;
}

#toast-root {
  position: fixed;
  top: 0.75em;
  right: 0.75em;
  z-index: 1000;
  display: flex;
  flex-direction: column;
  gap: 0.5em;
  pointer-events: none;
}

.toast {
  min-width: 12em;
  max-width: 20em;
  padding: 0.6em 0.8em;
  border-radius: 6px;
  background: #111;
  color: #fff;
  font-size: 0.875em;
  opacity: 0;
  transform: translateY(-6px);
  transition: opacity 160ms ease, transform 160ms ease;
}

.toast--in {
  opacity: 1;
  transform: translateY(0);
}

.toast--out {
  opacity: 0;
  transform: translateY(-6px);
}`,
  jsFile: "script.js",
  js: `function showToast(message) {
  var root = document.querySelector("#toast-root");
  if (!root) {
    root = document.createElement("div");
    root.id = "toast-root";
    document.body.appendChild(root);
  }
  var toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = message;
  root.appendChild(toast);
  toast.offsetWidth;
  toast.classList.add("toast--in");
  setTimeout(function () {
    toast.classList.remove("toast--in");
    toast.classList.add("toast--out");
    toast.addEventListener("transitionend", function () {
      toast.remove();
    }, { once: true });
  }, 1800);
}

function headingURL(id) {
  var url = new URL(window.location.href);
  url.hash = id;
  return url.toString();
}

function addHeadingPermalinks() {
  document.querySelectorAll(
    ".entry h1[id], .entry h2[id], .entry h3[id], .entry h4[id], .entry h5[id], .entry h6[id]"
  ).forEach(function (heading) {
    if (heading.querySelector(".heading-anchor")) return;
    var anchor = document.createElement("a");
    anchor.href = "#" + heading.id;
    anchor.className = "heading-anchor";
    anchor.textContent = "#";
    anchor.setAttribute("aria-label", "Copy link to this section");
    anchor.addEventListener("click", function (event) {
      event.preventDefault();
      if (heading.id !== window.location.hash.slice(1)) {
        history.pushState(null, "", "#" + heading.id);
      } else {
        heading.scrollIntoView({ behavior: "smooth", block: "start" });
      }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(headingURL(heading.id)).catch(function () {});
      }
      showToast("Link copied to your clipboard");
    });
    heading.appendChild(anchor);
  });
}

addHeadingPermalinks();`,
  demoJS: `function showToast(message) {
  var toastRoot = root.querySelector(".toast-root");
  if (!toastRoot) {
    toastRoot = document.createElement("div");
    toastRoot.className = "toast-root";
    toastRoot.id = "toast-root";
    root.appendChild(toastRoot);
  }
  var toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = message;
  toastRoot.appendChild(toast);
  toast.offsetWidth;
  toast.classList.add("toast--in");
  setTimeout(function () {
    toast.classList.remove("toast--in");
    toast.classList.add("toast--out");
    toast.addEventListener("transitionend", function () {
      toast.remove();
    }, { once: true });
  }, 1800);
}

root.querySelectorAll(
  ".entry h1[id], .entry h2[id], .entry h3[id], .entry h4[id], .entry h5[id], .entry h6[id]"
).forEach(function (heading) {
  if (heading.querySelector(".heading-anchor")) return;
  var anchor = document.createElement("a");
  anchor.href = "#" + heading.id;
  anchor.className = "heading-anchor";
  anchor.textContent = "#";
  anchor.setAttribute("aria-label", "Copy link to this section");
  anchor.addEventListener("click", function (event) {
    event.preventDefault();
    if (navigator.clipboard && navigator.clipboard.writeText) {
      var url = new URL(window.location.href);
      url.hash = heading.id;
      navigator.clipboard.writeText(url.toString()).catch(function () {});
    }
    showToast("Link copied to your clipboard");
  });
  heading.appendChild(anchor);
});`,
  demoHTML: `<div class="entry">
  <h2 id="notes-on-citrus">Notes on citrus</h2>
  <p>Hover the heading, then click <strong>#</strong> to copy a permalink.</p>
  <h3 id="harvest">Harvest</h3>
  <p>A nested heading gets its own link.</p>
</div>`,
  demoCaption:
    "Headings without an `id` are skipped. Blot’s Markdown converter normally adds ids; check the rendered HTML if the links never appear.",
  guidance: `Hypertext injects an anchor into every \`.entry h1–h6\` that already has an \`id\`. Clicking it updates the hash and copies the full URL.

**How to add it**

- Restrict the selector to \`.entry h1, …\` so the site title and archives headings are not modified.
- Skip headings without \`id\`. Do not invent slugs in the template; the converter owns those.
- \`history.pushState\` avoids a jump when the hash changes. \`scrollIntoView\` covers the “already on this heading” click.
- Reuse the toast CSS from [code-block copy](/developers/patterns/code-copy-button). One \`#toast-root\` on \`document.body\` is enough for both.
- If you also run a table-of-contents library (Documentation uses tocbot), let it generate ids first, then run this script, or only target headings that already have ids (as above).

**Common mistakes**

- Wrapping the heading text in a link in Mustache. That fights the converter and usually breaks the outline.
- Using \`window.location.hash = id\`, which jumps the page and can steal scroll restoration.
- Copying only \`#id\` instead of the absolute URL. Readers paste these into chat; they need the host.`,
  accessibility: `- The control is a link with \`aria-label="Copy link to this section"\`. A bare \`#\` is not a name.
- Reveal on \`:focus-visible\` as well as hover.
- \`preventDefault\` on click means Enter still activates the control (it is a link) and then copies. Keep it a link so the URL is still crawlable if JS fails — without JS the \`href="#id"\` just jumps, which is a good fallback. The script is progressive enhancement.`,
  related: ["code-copy-button", "details-disclosure"],
};
