const importContainer = document.querySelector("[data-import-base]");
const liveUpdatesContainer = document.querySelector(".live-updates");
const importStatusContainer = document.querySelector('[id^="status-"]');

if (importContainer && (liveUpdatesContainer || importStatusContainer)) {
  const ReconnectingEventSource = require("./reconnecting-event-source.js");

  const importBase = importContainer.getAttribute("data-import-base");

  if (importBase) {
    const evtSource = new ReconnectingEventSource(`${importBase}/status`);

    let currentlyLoading = false;
    let checkAgain = false;

    evtSource.onmessage = function (event) {
      const { status, importID } = JSON.parse(event.data);

      const statusNode = document.getElementById("status-" + importID);

      if (!statusNode) {
        return;
      }

      statusNode.removeAttribute("data-text");
      statusNode.innerHTML = status;
      truncate(statusNode);

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
