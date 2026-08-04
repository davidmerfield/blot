const importContainer = document.querySelector("[data-import-base]");
const liveUpdatesContainer = document.querySelector(".live-updates");
const importStatusContainer = document.querySelector('[id^="status-"]');
const PROGRESS_MESSAGE_RE = /^\((\d+)\/(\d+)\)\s*(.*)$/;

function renderImportStatus(statusNode, message) {
  const match = (message || "").match(PROGRESS_MESSAGE_RE);
  const statusContainer = statusNode.closest(".sync-status");
  const progressBar = statusContainer
    ? statusContainer.querySelector(".sync-status-progress-bar")
    : null;

  statusNode.textContent = match ? match[3] : message || "";

  if (statusContainer && match) {
    const current = parseInt(match[1], 10);
    const total = parseInt(match[2], 10);
    const percent = total > 0 ? (current / total) * 100 : 0;

    statusContainer.classList.add("has-progress");
    if (progressBar) {
      progressBar.style.width = Math.max(0, Math.min(100, percent)) + "%";
    }
  } else if (statusContainer) {
    statusContainer.classList.remove("has-progress");
    if (progressBar) progressBar.style.width = "0%";
  }

  truncate(statusNode);
}

function renderImportStatuses() {
  document.querySelectorAll('[id^="status-"]').forEach(function (statusNode) {
    renderImportStatus(statusNode, statusNode.textContent);
  });
}

if (importContainer && (liveUpdatesContainer || importStatusContainer)) {
  const ReconnectingEventSource = require("./reconnecting-event-source.js");

  const importBase = importContainer.getAttribute("data-import-base");

  if (importBase) {
    const evtSource = new ReconnectingEventSource(`${importBase}/status`);

    let currentlyLoading = false;
    let checkAgain = false;

    renderImportStatuses();

    evtSource.onmessage = function (event) {
      const { status, importID } = JSON.parse(event.data);

      const statusNode = document.getElementById("status-" + importID);

      if (!statusNode) {
        return;
      }

      statusNode.removeAttribute("data-text");
      renderImportStatus(statusNode, status);

      if (status === "Finished") {
        refreshFolder();
      }
    };

    function refreshFolder() {
      if (currentlyLoading) {
        checkAgain = true;
        return;
      }

      currentlyLoading = true;

      if (!document.querySelector(".live-updates")) {
        currentlyLoading = false;
        return;
      }

      loadFolder(function onLoad() {
        if (checkAgain === true) {
          checkAgain = false;
          return loadFolder(onLoad);
        }

        currentlyLoading = false;
      });
    }

    function loadFolder(callback) {
      const xhr = new XMLHttpRequest();

      xhr.onreadystatechange = function () {
        if (xhr.readyState == 4 && xhr.status == 200) {
          const parser = new DOMParser();
          const xml = parser.parseFromString(xhr.responseText, "text/html");

          const currentNode = document.querySelector(".live-updates");
          const newNode = xml.querySelector(".live-updates");

          if (currentNode !== null && newNode !== null) {
            const currentState = currentNode.innerHTML;
            const newState = newNode.innerHTML;

            if (newState === currentState) return callback();

            currentNode.innerHTML = newState;
            renderImportStatuses();
          }

          callback();
        }
      };

      xhr.open("GET", window.location, true);
      xhr.setRequestHeader("Content-type", "text/html");
      xhr.send();
    }
  }
}
