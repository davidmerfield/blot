var previewIframeContainer = document.querySelector(".iframe-container");

if (previewIframeContainer) {
  var previewOrigin = previewIframeContainer.getAttribute("data-origin") || "";
  var iframe = previewIframeContainer.querySelector("iframe");
  var previewLink = document.querySelector("a[data-preview-link]");

  var iframeContainerWidth = previewIframeContainer.offsetWidth;
  document.documentElement.style.setProperty(
    "--iframe-container-width",
    iframeContainerWidth
  );
  window.addEventListener("resize", function () {
    var iframeContainerWidth = previewIframeContainer.offsetWidth;
    document.documentElement.style.setProperty(
      "--iframe-container-width",
      iframeContainerWidth
    );
  });

  if (!iframe || !previewOrigin) {
    return;
  }

  var localStorageAvailable = false;
  try {
    localStorageAvailable = typeof window.localStorage !== "undefined";
  } catch (err) {
    localStorageAvailable = false;
  }

  var storageKey = localStorageAvailable
    ? "template-preview-path:" + previewOrigin
    : null;

  var normalizePath = function normalizePath(path) {
    if (!path || typeof path !== "string") return "";
    var trimmed = path.trim();
    if (!trimmed) return "";
    if (trimmed.indexOf("://") !== -1) return "";
    if (trimmed.charAt(0) !== "/") {
      trimmed = "/" + trimmed;
    }
    return trimmed;
  };

  var writeStoredPath = function writeStoredPath(path) {
    if (!storageKey || !localStorageAvailable) return;
    try {
      if (path) {
        window.localStorage.setItem(storageKey, path);
      } else {
        window.localStorage.removeItem(storageKey);
      }
    } catch (err) {}
  };

  var readStoredPath = function readStoredPath() {
    if (!storageKey || !localStorageAvailable) return "";
    try {
      var value = window.localStorage.getItem(storageKey);
      return normalizePath(value);
    } catch (err) {
      return "";
    }
  };

  var updatePreviewLink = function updatePreviewLink(path) {
    if (!previewLink) return;
    var href = previewOrigin;
    if (path) {
      href += path;
    }
    previewLink.href = href;
  };

  var storedPath = readStoredPath();
  if (storedPath) {
    iframe.setAttribute("src", previewOrigin + storedPath);
  }
  updatePreviewLink(storedPath);

  // Listen to messages sent from the iframe which contains
  // the preview of the template. We inject the script
  // which sends these messages before the </body> tag of
  // all HTML pages rendered on preview subdomains.
  var receiveMessage = function receiveMessage(e) {
    if (e.origin !== previewOrigin) return;
    if (typeof e.data !== "string" || e.data.indexOf("iframe:") !== 0) return;

    var path = normalizePath(e.data.slice("iframe:".length));

    updatePreviewLink(path);
    writeStoredPath(path);
  };

  window.addEventListener("message", receiveMessage, false);
}
