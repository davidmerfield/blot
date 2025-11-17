require("./relativeDate.js");
require("./truncate.js");
require("./sync_status.js");
require("./instant.page.js");
require("./contact-form.js");
require("./tagify.js");
require("./examples.js");

// must come before copy-buttons.js so that the copy buttons are generated
require("./multi-lingual-code.js");

require("./copy-buttons.js");

const isSignedIn = document.cookie.includes("signed_into_blot");

document.documentElement.dataset.auth = isSignedIn ? "in" : "out";

const authStyle = document.createElement("style");
authStyle.textContent =
  'html[data-auth="out"] .signed-in { display: none !important; }' +
  'html[data-auth="in"] .signed-out { display: none !important; }';
document.head.appendChild(authStyle);

function applyVisibility(node) {
  if (!node || !node.classList) return;

  if (node.classList.contains("signed-in")) {
    node.style.display = isSignedIn ? "block" : "none";
  }

  if (node.classList.contains("signed-out")) {
    node.style.display = isSignedIn ? "none" : "block";
  }
}

document.querySelectorAll(".signed-in, .signed-out").forEach(function (node) {
  applyVisibility(node);
});

const observer = new MutationObserver(function (mutations) {
  mutations.forEach(function (mutation) {
    mutation.addedNodes.forEach(function (node) {
      if (
        node.nodeType !== Node.ELEMENT_NODE &&
        node.nodeType !== Node.DOCUMENT_FRAGMENT_NODE
      ) {
        return;
      }

      if (node.nodeType === Node.ELEMENT_NODE) {
        applyVisibility(node);
      }

      if (typeof node.querySelectorAll === "function") {
        node
          .querySelectorAll(".signed-in, .signed-out")
          .forEach(function (child) {
            applyVisibility(child);
          });
      }
    });
  });
});

observer.observe(document.body, { childList: true, subtree: true });
