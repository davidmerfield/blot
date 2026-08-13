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

  var empty = root.querySelector("[data-template-upload-empty]");
  var selected = root.querySelector("[data-template-upload-selected]");
  var selectedLabel = root.querySelector("[data-template-upload-selected-label]");
  var fileList = root.querySelector("[data-template-upload-files]");
  var clear = root.querySelector("[data-template-upload-clear]");

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

  // One row per file, keyed by path so the response can update them in place
  var rows = {};

  var FILE_ICON =
    "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" +
    "|M14 2v6h6M8 13h8M8 17h8M8 9h2";

  function svgIcon() {
    var svg = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "svg"
    );

    svg.setAttribute("class", "file-drop__file-icon");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "1.5");
    svg.setAttribute("aria-hidden", "true");

    FILE_ICON.split("|").forEach(function (d) {
      var path = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "path"
      );
      path.setAttribute("d", d);
      svg.appendChild(path);
    });

    return svg;
  }

  function setLabel(text) {
    if (selectedLabel) selectedLabel.textContent = text || "";
  }

  function setStatus(message) {
    setLabel(message);
  }

  function showEmptyState() {
    rows = {};
    if (fileList) fileList.innerHTML = "";
    if (empty) empty.hidden = false;
    if (selected) selected.hidden = true;
  }

  // Replaces the drop instructions with one row per file, the way the
  // importer swaps its instructions for the file it is about to import
  function showFiles(paths, label) {
    if (!fileList || !selected) return;

    rows = {};
    fileList.innerHTML = "";

    paths.forEach(function (path) {
      var row = document.createElement("div");
      row.className = "file-drop__chip template-upload__file";

      var name = document.createElement("span");
      name.className = "file-drop__name";
      name.textContent = path;

      var state = document.createElement("span");
      state.className = "template-upload__file-state";

      row.appendChild(svgIcon());
      row.appendChild(name);
      row.appendChild(state);
      fileList.appendChild(row);

      rows[path] = { row: row, state: state };
    });

    setLabel(label);

    if (empty) empty.hidden = true;
    selected.hidden = false;
  }

  function setFileState(path, text, modifier) {
    var entry = rows[path];
    if (!entry) return;

    entry.state.textContent = text || "";
    entry.row.className =
      "file-drop__chip template-upload__file" +
      (modifier ? " template-upload__file--" + modifier : "");
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
  // The server decides what a zip actually contained and which files were set
  // aside, so the rows only become accurate once it has answered. Re-render
  // them from the response rather than leaving the user looking at a single
  // 'template.zip' row.
  function showResult(result) {
    var views = result.views || [];
    var ignored = result.ignored || [];

    showFiles(
      views.concat(
        ignored.map(function (item) {
          return item.path;
        })
      ),
      views.length === 1
        ? "Created 1 file in " + result.name
        : "Created " + views.length + " files in " + result.name
    );

    views.forEach(function (name) {
      setFileState(name, "Added", "added");
    });

    ignored.forEach(function (item) {
      setFileState(item.path, "Skipped", "ignored");
    });
  }

  function finish(result) {
    setWorking(false);
    showResult(result);

    if (!result.warnings || !result.warnings.length || !warningBox) {
      window.location = result.redirect;
      return;
    }

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

    var paths = entries.map(function (entry) {
      return entry.relativePath;
    });

    showFiles(
      paths,
      paths.length === 1
        ? "Uploading 1 file…"
        : "Uploading " + paths.length + " files…"
    );

    paths.forEach(function (path) {
      setFileState(path, "Uploading…", "working");
    });

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

        // Leave the rows on screen and mark the ones at fault, so the message
        // above the list and the file it refers to are visible together
        paths.forEach(function (path) {
          setFileState(path, "", null);
        });

        (err.problems || []).forEach(function (problem) {
          if (problem.path) setFileState(problem.path, "Problem", "problem");
        });

        setLabel(
          paths.length === 1 ? "1 file" : paths.length + " files"
        );

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

  if (clear) {
    clear.addEventListener("click", function (event) {
      event.preventDefault();
      if (working) return;
      hideNotices();
      showEmptyState();
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
