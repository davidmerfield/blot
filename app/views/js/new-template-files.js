var collect = require("./collect-dropped-files.js");

// Drag-and-drop upload on the 'New template' page. Ships in dashboard.min.js,
// which every dashboard page loads, so do nothing unless the panel is present.

// Keep these in step with save/constants.js. Checking here means the common
// mistake — dropping a whole site, or a folder full of images — gets a clear
// message instead of the generic 413 page the multipart limit would produce.
var MAX_RAW_FILES = 1000;
var MAX_TOTAL_BYTES = 10 * 1024 * 1024;

var ZIP_PATTERN = /\.zip$/i;
var ZIP_TYPES = ["application/zip", "application/x-zip-compressed"];

function isZip(file) {
  return ZIP_PATTERN.test(file.name) || ZIP_TYPES.indexOf(file.type) > -1;
}

function totalBytes(entries) {
  return entries.reduce(function (total, entry) {
    return total + (entry.file.size || 0);
  }, 0);
}

function init(root) {
  var dropzone = root.querySelector("[data-template-upload-dropzone]");
  var folderInput = root.querySelector("[data-template-upload-folder-input]");
  var zipInput = root.querySelector("[data-template-upload-zip-input]");
  var status = root.querySelector("[data-template-upload-status]");

  var errorBox = root.querySelector("[data-template-upload-error]");
  var errorMessage = root.querySelector("[data-template-upload-message]");
  var problemList = root.querySelector("[data-template-upload-problems]");
  var dismiss = root.querySelector("[data-template-upload-dismiss]");

  var warningBox = root.querySelector("[data-template-upload-warning]");
  var warningMessage = root.querySelector(
    "[data-template-upload-warning-message]"
  );
  var warningList = root.querySelector("[data-template-upload-warnings]");
  var continueLink = root.querySelector("[data-template-upload-continue]");

  var csrfToken = root.getAttribute("data-csrf");
  var action = root.getAttribute("data-action");

  if (!dropzone || !action) return;

  var dragDepth = 0;
  var working = false;

  function setStatus(message) {
    if (status) status.textContent = message || "";
  }

  function renderList(list, items, withPath) {
    if (!list) return;

    list.innerHTML = "";

    (items || []).forEach(function (item) {
      var li = document.createElement("li");
      var path = withPath && item.path;

      if (path) {
        var code = document.createElement("code");
        code.textContent = path;
        li.appendChild(code);
        li.appendChild(document.createTextNode(" "));
      }

      li.appendChild(
        document.createTextNode(
          (withPath ? item.message : item) || "This file could not be used"
        )
      );

      list.appendChild(li);
    });
  }

  function hideNotices() {
    if (errorBox) errorBox.hidden = true;
    if (warningBox) warningBox.hidden = true;
  }

  function showError(message, problems) {
    setStatus("");

    if (!errorBox) return;

    if (errorMessage) errorMessage.textContent = message || "";
    renderList(problemList, problems, true);
    errorBox.hidden = false;
  }

  function setWorking(isWorking) {
    working = isWorking;
    root.classList.toggle("is-working", isWorking);
    if (folderInput) folderInput.disabled = isWorking;
    if (zipInput) zipInput.disabled = isWorking;
  }

  function buildFormData(entries) {
    var formData = new FormData();

    if (entries.length === 1 && isZip(entries[0].file)) {
      formData.append("zip", entries[0].file, entries[0].file.name);
    } else {
      var relativePaths = [];

      entries.forEach(function (entry, index) {
        var field = "upload-" + index;
        formData.append(field, entry.file, entry.file.name);
        relativePaths.push({
          field: field,
          index: 0,
          relativePath: entry.relativePath,
        });
      });

      formData.append("relativePaths", JSON.stringify(relativePaths));
    }

    formData.append("_csrf", csrfToken);

    return formData;
  }

  // Warnings mean the template was created but not quite as its package.json
  // asked — it was not installed, or describes files which were not uploaded.
  // Redirecting straight past them would mean nobody ever reads them.
  function finish(result) {
    if (!result.warnings || !result.warnings.length || !warningBox) {
      window.location = result.redirect;
      return;
    }

    setWorking(false);
    setStatus("");

    if (warningMessage) {
      warningMessage.textContent = "Created " + result.name + ".";
    }

    renderList(warningList, result.warnings, false);

    if (continueLink) continueLink.href = result.redirect;

    warningBox.hidden = false;
  }

  function upload(entries) {
    if (working || !entries.length) return;

    hideNotices();

    if (entries.length > MAX_RAW_FILES) {
      return showError(
        "That folder contains " +
          entries.length +
          " files, which is far more than a template can use.",
        []
      );
    }

    if (totalBytes(entries) > MAX_TOTAL_BYTES) {
      return showError(
        "Those files are too large to be a template. The most a template can be is " +
          Math.round(MAX_TOTAL_BYTES / 1024 / 1024) +
          " MB.",
        []
      );
    }

    setWorking(true);
    setStatus(
      entries.length === 1
        ? "Uploading " + entries[0].relativePath + "…"
        : "Uploading " + entries.length + " files…"
    );

    fetch(action, { method: "POST", body: buildFormData(entries) })
      .then(function (response) {
        return response
          .json()
          .catch(function () {
            // The multipart limit is enforced before our route runs and
            // renders an HTML error page rather than JSON
            throw new Error(
              response.status === 413
                ? "Those files are too large to upload."
                : "Something went wrong uploading this template."
            );
          })
          .then(function (result) {
            if (!response.ok) {
              var error = new Error(
                result.error || "This template could not be uploaded."
              );
              error.problems = result.problems;
              throw error;
            }

            return result;
          });
      })
      .then(finish)
      .catch(function (err) {
        setWorking(false);
        showError(err.message, err.problems);
      });
  }

  function handleDropped(dataTransfer) {
    collect
      .collectDroppedFiles(dataTransfer)
      .then(upload)
      .catch(function () {
        showError(
          "That folder could not be read. Try choosing it instead.",
          []
        );
      });
  }

  // Without this the browser navigates away to display a dropped file
  function preventNavigation(event) {
    if (collect.hasFileDragPayload(event.dataTransfer)) event.preventDefault();
  }

  window.addEventListener("dragover", preventNavigation);
  window.addEventListener("drop", preventNavigation);

  if (dismiss) {
    dismiss.addEventListener("click", function (event) {
      event.preventDefault();
      hideNotices();
    });
  }

  dropzone.addEventListener("dragenter", function (event) {
    if (!collect.hasFileDragPayload(event.dataTransfer)) return;
    event.preventDefault();
    dragDepth += 1;
    dropzone.classList.add("is-dragover");
  });

  dropzone.addEventListener("dragover", function (event) {
    if (!collect.hasFileDragPayload(event.dataTransfer)) return;
    event.preventDefault();
  });

  dropzone.addEventListener("dragleave", function (event) {
    event.preventDefault();
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0) dropzone.classList.remove("is-dragover");
  });

  dropzone.addEventListener("drop", function (event) {
    dragDepth = 0;
    dropzone.classList.remove("is-dragover");

    if (!collect.hasFileDragPayload(event.dataTransfer)) return;

    event.preventDefault();
    handleDropped(event.dataTransfer);
  });

  [folderInput, zipInput].forEach(function (input) {
    if (!input) return;
    input.addEventListener("change", function () {
      upload(collect.collectSelectedFiles(input));
      // Let the same folder be chosen again after a failure
      input.value = "";
    });
  });
}

if (typeof document !== "undefined") {
  document.querySelectorAll("[data-template-upload]").forEach(init);
}

module.exports = { init: init, isZip: isZip };
