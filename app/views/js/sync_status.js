require("./reconnecting-event-source.js");

var THROTTLE_DELAY = 2000; // ms

var inFlight = false;
var nextAt = 0;
var timerId = null;
var pendingWhileHidden = false;
var evtSource = null;
var shouldReload = false;

function q(sel) {
  return document.querySelector(sel);
}

function updateContainerClass() {
  var statusContainer = q(".sync-status");
  var statusText = q(".sync-status-text").innerText || "";

  if (statusText.startsWith("Synced")) {
    statusContainer.classList.remove("syncing", "error");
    statusContainer.classList.add("synced");
  } else if (statusText.startsWith("Error")) {
    statusContainer.classList.remove("syncing", "synced");
    statusContainer.classList.add("error");
  } else {
    statusContainer.classList.remove("synced", "error");
    statusContainer.classList.add("syncing");
  }
}

function scheduleLoad() {
  if (document.visibilityState === "hidden") {
    pendingWhileHidden = true;
    return;
  }

  var now = Date.now();
  var when = Math.max(nextAt, now);

  if (timerId) {
    shouldReload = true;
    return;
  }

  if (!inFlight && now >= nextAt) {
    runLoad();
  } else {
    timerId = setTimeout(function () {
      timerId = null;
      runLoad();
    }, when - now);
  }
}

function runLoad() {
  if (inFlight) return;
  inFlight = true;
  var started = Date.now();

  loadFolder(function done() {
    inFlight = false;
    nextAt = started + THROTTLE_DELAY;
    // If events piled up, one schedule() coalesces them.
    if (shouldReload) {
      shouldReload = false;
      scheduleLoad();
    }
  });
}

function loadFolder(callback) {
  var xhr = new XMLHttpRequest();

  xhr.onreadystatechange = function () {
    if (xhr.readyState === 4) {
      if (xhr.status === 200) {
        var parser = new DOMParser();
        var xml = parser.parseFromString(xhr.responseText, "text/html");

        var currentNode = q(".live-updates");
        var newNode = xml.querySelector(".live-updates");

        if (currentNode && newNode) {
          var currentState = currentNode.innerHTML;
          var newState = newNode.innerHTML;

          if (newState !== currentState) {
            currentNode.innerHTML = newState;

            try {
              sortTable();
            } catch (e) {
              console.error(e);
            }
            try {
              initCopyButtons();
            } catch (e) {
              console.error(e);
            }
            try {
              updateContainerClass();
            } catch (e) {
              console.error(e);
            }
          }
        }
      } else {
        console.error("Failed to load folder:", xhr.status);
      }
      callback();
    }
  };

  xhr.open("GET", window.location.href, true);
  xhr.send();
}

function attachSSE() {
  var statusContainer = q(".sync-status");
  if (!statusContainer) return;

  updateContainerClass();

  var syncStatusURL = statusContainer.getAttribute("data-sync-status-url");
  if (!syncStatusURL) {
    console.error("No sync status URL provided.");
    return;
  }

  if (evtSource) evtSource.close();
  evtSource = new ReconnectingEventSource(syncStatusURL);

  evtSource.onmessage = function (event) {
    var message = event.data || "";

    if (message.startsWith("Syncing /")) {
      var path = message.slice("Syncing ".length);
      var filename = path.split("/").pop();
      message = "Syncing " + filename;
    }

    var sc = q(".sync-status-text");
    if (sc) {
      sc.innerHTML = message;
      updateContainerClass();
    }

    if (q(".live-updates")) {
      scheduleLoad();
    }
  };
}

// One-time listeners
document.addEventListener("visibilitychange", function () {
  if (document.visibilityState === "visible" && pendingWhileHidden) {
    pendingWhileHidden = false;
    scheduleLoad();
  }
});

window.addEventListener("beforeunload", function () {
  if (evtSource) evtSource.close();
});

// First attach on initial load
document.addEventListener("DOMContentLoaded", function () {
  attachSSE();
});
