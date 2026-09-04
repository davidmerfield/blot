module.exports = {
  slug: "code-copy-button",
  title: "Code-block copy button",
  summary:
    "Inject a Copy button on every <pre>, write the text to the clipboard, and show a short toast.",
  category: "Scripts",
  sourceTemplates: [
    {
      name: "Hypertext",
      files: [
        "app/templates/source/hypertext/pre-copy.js",
        "app/templates/source/hypertext/pre-copy-styles.css",
      ],
    },
  ],
  whenToUse:
    "Add this when the template renders fenced code in `{{{html}}}`. Skip it if the site never shows code, or if you already wrap blocks in a toolbar (the Documentation template’s language tabs include their own Copy button).",
  htmlFile: "entry.html",
  html: `{{#entry}}
<div class="entry">
  {{{html}}}
</div>
{{/entry}}`,
  cssFile: "style.css",
  css: `.entry pre {
  position: relative;
  overflow: auto;
  padding: 1em 2.75em 1em 1em;
}

.pre-copy-btn {
  position: absolute;
  top: 0.5em;
  right: 0.5em;
  font: inherit;
  font-size: 0.75em;
  line-height: 1;
  padding: 0.35em 0.55em;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: inherit;
  opacity: 0;
  cursor: pointer;
}

.entry pre:hover .pre-copy-btn,
.pre-copy-btn:focus-visible {
  opacity: 0.7;
}

.pre-copy-btn:hover,
.pre-copy-btn:focus-visible {
  opacity: 1;
  background: rgba(0, 0, 0, 0.06);
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

function addCopyButtons() {
  document.querySelectorAll("pre").forEach(function (pre) {
    if (pre.dataset.copyBtnInjected === "1") return;
    pre.dataset.copyBtnInjected = "1";
    if (getComputedStyle(pre).position === "static") {
      pre.style.position = "relative";
    }
    var button = document.createElement("button");
    button.type = "button";
    button.className = "pre-copy-btn";
    button.textContent = "Copy";
    button.setAttribute("aria-label", "Copy code to clipboard");
    button.addEventListener("click", function (event) {
      event.stopPropagation();
      var source = pre.querySelector("code") || pre;
      var text = source.textContent;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).catch(function () {});
      }
      showToast("Copied to your clipboard");
    });
    pre.appendChild(button);
  });
}

addCopyButtons();`,
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

root.querySelectorAll("pre").forEach(function (pre) {
  if (pre.dataset.copyBtnInjected === "1") return;
  pre.dataset.copyBtnInjected = "1";
  pre.style.position = "relative";
  var button = document.createElement("button");
  button.type = "button";
  button.className = "pre-copy-btn";
  button.textContent = "Copy";
  button.setAttribute("aria-label", "Copy code to clipboard");
  button.addEventListener("click", function (event) {
    event.stopPropagation();
    var source = pre.querySelector("code") || pre;
    var text = source.textContent;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).catch(function () {});
    }
    showToast("Copied to your clipboard");
  });
  pre.appendChild(button);
});`,
  demoHTML: `<div class="entry">
<pre><code>function greet(name) {
  return "Hello, " + name;
}</code></pre>
</div>`,
  demoCaption:
    "Hover the block (or tab to the button) and click Copy. The toast is the same one Hypertext uses for heading permalinks.",
  guidance: `Authors write fenced code in Markdown. Pandoc emits \`<pre><code>…</code></pre>\` inside \`{{{html}}}\`. The template does not generate the blocks; it only adds a button.

**How to add it**

- Put the CSS in \`style.css\` and the script in \`script.js\`. Hypertext keeps them as \`pre-copy.js\` / \`pre-copy-styles.css\` partials; one file each is enough.
- Query \`pre\`, not \`code\`. You want one button per block, including blocks that are not highlighted.
- \`dataset.copyBtnInjected\` stops a second pass (PJAX, infinite scroll) from stacking buttons.
- Read \`pre.querySelector("code") || pre\` so the button label is not copied onto the clipboard.
- \`navigator.clipboard.writeText\` needs HTTPS (Blot sites are). Catch failures; still show the toast only on success if you want to be strict.
- Scope hover styles to \`.entry pre\` so a header \`<pre>\` (unusual) does not get a button. The script above is global; tighten the selector to \`.entry pre\` if the template has other pres.
- The Documentation template’s \`multi-lingual.js\` already adds Copy plus language tabs. Do not stack this pattern on top of that.

**Common mistakes**

- Adding the button in Mustache. There is no \`{{#codeBlocks}}\` array. Inject in JavaScript.
- Using \`innerHTML\` as the clipboard payload. That copies tags. \`textContent\` is the source.
- Forgetting \`position: relative\` on \`pre\`, so the button sits in the wrong corner.`,
  accessibility: `- The control is a real \`<button type="button">\` with an accessible name (“Copy code to clipboard”). An icon-only button (Hypertext) must keep \`aria-label\`.
- Reveal the button on \`:focus-visible\`, not only hover, so keyboard users can find it.
- Do not copy on a timer or on hover. Click/Enter only.
- The toast is feedback, not a live region you should trap focus in. Keep it \`pointer-events: none\` on the root.`,
  related: ["heading-permalinks", "task-lists"],
};
