// Add copy buttons to <pre> blocks that contain code highlighted by hljs.
// Uses the same unified markup/classes as the template-output blocks:
//   .code-block (container) + .code-block-wrapper (pane) + button.copy
// Copy behavior is handled by copy-buttons.js.

function initCodeCopyButtons(root) {
  if (!root) root = document;

  root.querySelectorAll("pre > code.hljs").forEach(function (code) {
    var pre = code.parentElement;
    if (!pre) return;

    // Skip if this pre is already inside a unified code block
    if (pre.closest(".code-block")) return;

    var container = document.createElement("div");
    container.className = "code-block";

    var toolbar = document.createElement("div");
    toolbar.className = "code-block-toolbar";

    var file = pre.getAttribute("data-file");
    if (file) {
      var label = document.createElement("span");
      label.className = "code-block-label";
      label.innerHTML = '<span class="icon-file"></span> ' + file;
      toolbar.appendChild(label);
    } else {
      toolbar.classList.add("code-block-toolbar--single");
    }

    var copy = document.createElement("button");
    copy.type = "button";
    copy.innerHTML = '<span class="icon-copy"></span> Copy';
    copy.classList.add("copy");
    copy.setAttribute("data-copy", code.textContent);

    var pane = document.createElement("div");
    pane.className = "code-block-wrapper active";

    toolbar.appendChild(copy);
    container.appendChild(toolbar);

    pre.parentNode.insertBefore(container, pre);
    container.appendChild(pane);
    pane.appendChild(pre);
  });

  // Ensure new buttons get handlers
  if (typeof window.initCopyButtons === "function") {
    window.initCopyButtons();
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", function () {
    initCodeCopyButtons();
  });
} else {
  initCodeCopyButtons();
}

window.initCodeCopyButtons = initCodeCopyButtons;
