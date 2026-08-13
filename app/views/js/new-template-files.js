var collect = require("./collect-dropped-files.js");

// Drag-and-drop upload on the 'New template' page. Ships in dashboard.min.js,
// which every dashboard page loads, so do nothing unless the panel is present.

// Keep these in step with save/constants.js. Checking here means the common
// mistake — dropping a whole site, or a folder full of images — gets a clear
// message instead of the generic 413 page the multipart limit would produce.
var MAX_FILES = 100;
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
  var nameInput = root.querySelector("[data-template-upload-name]");
  var problemList = root.querySelector("[data-template-upload-problems]");
  var status = root.querySelector("[data-template-upload-status]");
  var csrfToken = root.getAttribute("data-csrf");
  var action = root.getAttribute("data-action");

  if (!dropzone || !action) return;

  var dragDepth = 0;
  var working = false;

  function setStatus(message) {
    if (status) status.textContent = message || "";
  }

  function clearProblems() {
    if (problemList) {
      problemList.innerHTML = "";
      problemList.hidden = true;
    }
  }

  function showProblems(title, problems) {
    setStatus(title);

    if (!problemList) return;

    problemList.innerHTML = "";

    (problems || []).forEach(function (problem) {
      var item = document.createElement("li");

      if (problem.path) {
        var path = document.createElement("code");
        path.textContent = problem.path;
        item.appendChild(path);
        item.appendChild(document.createTextNode(" "));
      }

      item.appendChild(
        document.createTextNode(problem.message || "This file could not be used")
      );
      problemList.appendChild(item);
    });

    problemList.hidden = problems && problems.length ? false : true;
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

    if (nameInput && nameInput.value.trim()) {
      formData.append("name", nameInput.value.trim());
    }

    formData.append("_csrf", csrfToken);

    return formData;
  }

  function upload(entries) {
    if (working || !entries.length) return;

    clearProblems();

    if (entries.length > MAX_FILES) {
      return showProblems(
        "A template cannot contain more than " +
          MAX_FILES +
          " files — you dropped " +
          entries.length +
          ".",
        []
      );
    }

    if (totalBytes(entries) > MAX_TOTAL_BYTES) {
      return showProblems(
        "These files are too large to be a template. The most a template can be is " +
          Math.round(MAX_TOTAL_BYTES / 1024 / 1024) +
          "mb.",
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
                ? "These files are too large to upload."
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
      .then(function (result) {
        setStatus("Created " + result.name + ". Opening it now…");
        window.location = result.redirect;
      })
      .catch(function (err) {
        setWorking(false);
        showProblems(err.message, err.problems);
      });
  }

  function handleDropped(dataTransfer) {
    collect
      .collectDroppedFiles(dataTransfer)
      .then(upload)
      .catch(function () {
        showProblems("This folder could not be read. Try choosing it instead.", []);
      });
  }

  // Without this the browser navigates away to display a dropped file
  function preventNavigation(event) {
    if (collect.hasFileDragPayload(event.dataTransfer)) event.preventDefault();
  }

  window.addEventListener("dragover", preventNavigation);
  window.addEventListener("drop", preventNavigation);

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
