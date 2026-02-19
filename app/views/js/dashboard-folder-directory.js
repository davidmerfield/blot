var folderBox = document.querySelector('.folder-box.directory');
var table = folderBox && folderBox.querySelector('.directory-list');

if (!folderBox || !table) {
  return;
}

var dropTarget = folderBox.querySelector('.folder-drop-target');
var uploadModal = folderBox.querySelector('.upload-preview-modal');
var uploadModalLists = {
  queued: uploadModal && uploadModal.querySelector('[data-upload-list="queued"]')
};
var uploadUrl = folderBox.getAttribute('data-upload-url');
var csrfToken = folderBox.getAttribute('data-csrf-token') || '';
var currentFolderPrefix = normalizeCurrentFolderPrefix(window.location.pathname);

var state = {
  column: null,
  order: null
};

var storedColumn = localStorage.getItem('sort-column');
if (storedColumn) state.column = storedColumn;

var storedOrder = localStorage.getItem('sort-order');
if (storedOrder) state.order = storedOrder;

Array.from(table.querySelectorAll('th')).forEach(function (th, index) {
  var width = localStorage.getItem('column-width-' + index);
  if (width) {
    th.style.width = width;
    var nextTh = th.nextElementSibling;
    var nextWidth = localStorage.getItem('column-width-' + (index + 1));
    if (nextTh && nextWidth) {
      nextTh.style.width = nextWidth;
    }
  }
});

sortTable();
window.sortTable = sortTable;

function sortTable() {
  var order = state.order || 'sorted';
  var column = state.column || 0;
  var reverse = order === 'reverse';
  var header = table.querySelector('th:nth-child(' + (parseInt(column, 10) + 1) + ')');

  if (!header) return;

  var index = Array.from(header.parentNode.children).indexOf(header);
  var rows = Array.from(table.querySelectorAll('tbody tr'));

  if (rows.length === 1 && rows[0].querySelector('td').textContent.trim() === 'Folder is empty.') {
    table.classList.add('empty');
  } else {
    table.classList.remove('empty');
  }

  if (rows.length < 2) {
    return;
  }

  header.classList.add(order);

  var sorted = rows.sort(function (a, b) {
    var aText = a.children[index].getAttribute('data-sort') ? parseInt(a.children[index].getAttribute('data-sort'), 10) : a.children[index].textContent.toLocaleLowerCase().trim();
    var bText = b.children[index].getAttribute('data-sort') ? parseInt(b.children[index].getAttribute('data-sort'), 10) : b.children[index].textContent.toLocaleLowerCase().trim();

    if (reverse) {
      return aText < bText ? 1 : -1;
    }

    return aText > bText ? 1 : -1;
  });

  table.querySelectorAll('th').forEach(function (th) {
    th.classList.remove('sorted', 'reverse');
  });

  header.classList.add('sorted');
  if (reverse) {
    header.classList.add('reverse');
  }

  rows.forEach(function (row) {
    row.remove();
  });

  sorted.forEach(function (row) {
    table.querySelector('tbody').appendChild(row);
  });
}

function refreshFolderContents(callback) {
  var xhr = new XMLHttpRequest();

  xhr.onreadystatechange = function () {
    if (xhr.readyState !== 4) return;

    if (xhr.status === 200) {
      var parser = new DOMParser();
      var xml = parser.parseFromString(xhr.responseText, 'text/html');
      var currentNode = document.querySelector('.live-updates');
      var newNode = xml.querySelector('.live-updates');

      if (currentNode && newNode) {
        currentNode.innerHTML = newNode.innerHTML;
        sortTable();
      }
    }

    if (typeof callback === 'function') callback();
  };

  xhr.open('GET', window.location.href, true);
  xhr.send();
}

function readAllDirectoryEntries(directoryReader) {
  return new Promise(function (resolve, reject) {
    var entries = [];

    function readBatch() {
      directoryReader.readEntries(function (batch) {
        if (!batch.length) return resolve(entries);
        entries = entries.concat(Array.from(batch));
        readBatch();
      }, reject);
    }

    readBatch();
  });
}

function collectDroppedFilesFromEntry(entry, parentPath) {
  var basePath = parentPath || '';

  if (entry.isFile) {
    return new Promise(function (resolve, reject) {
      entry.file(function (file) {
        resolve([{ file: file, relativePath: (basePath + file.name).replace(/^\//, '') }]);
      }, reject);
    });
  }

  if (entry.isDirectory) {
    var nextParent = (basePath + entry.name + '/').replace(/^\//, '');
    var reader = entry.createReader();

    return readAllDirectoryEntries(reader).then(function (entries) {
      return Promise.all(entries.map(function (childEntry) {
        return collectDroppedFilesFromEntry(childEntry, nextParent);
      })).then(function (nested) {
        return nested.reduce(function (all, set) {
          return all.concat(set);
        }, []);
      });
    });
  }

  return Promise.resolve([]);
}

function collectDroppedFiles(dataTransfer) {
  var items = Array.from((dataTransfer && dataTransfer.items) || []);
  var files = Array.from((dataTransfer && dataTransfer.files) || []);

  if (!items.length) {
    return Promise.resolve(files.map(function (file) {
      return { file: file, relativePath: file.name };
    }));
  }

  var hasEntrySupport = items.some(function (item) {
    return item.kind === 'file' && typeof item.webkitGetAsEntry === 'function' && item.webkitGetAsEntry();
  });

  if (!hasEntrySupport) {
    return Promise.resolve(files.map(function (file) {
      return { file: file, relativePath: file.webkitRelativePath || file.name };
    }));
  }

  var tasks = items.map(function (item) {
    if (item.kind !== 'file' || typeof item.webkitGetAsEntry !== 'function') {
      return Promise.resolve([]);
    }

    var entry = item.webkitGetAsEntry();
    if (!entry) return Promise.resolve([]);
    return collectDroppedFilesFromEntry(entry, '');
  });

  return Promise.all(tasks).then(function (sets) {
    return sets.reduce(function (all, set) {
      return all.concat(set);
    }, []);
  });
}

function hasFileDragPayload(dataTransfer) {
  if (!dataTransfer) return false;

  var items = Array.from(dataTransfer.items || []);
  if (items.some(function (item) { return item.kind === 'file'; })) {
    return true;
  }

  var types = Array.from(dataTransfer.types || []);
  if (types.some(function (type) { return String(type).toLowerCase() === 'files'; })) {
    return true;
  }

  return Array.from(dataTransfer.files || []).length > 0;
}

function isFileDropEvent(event) {
  return !!(event && hasFileDragPayload(event.dataTransfer));
}

function showDropTarget() {
  if (dropTarget) {
    dropTarget.style.display = 'flex';
  }
}

function hideDropTarget() {
  if (dropTarget) {
    dropTarget.style.display = 'none';
  }
}

function normalizeCurrentFolderPrefix(pathname) {
  var path = typeof pathname === 'string' ? pathname : '';
  var marker = '/folder/';
  var folderIndex = path.indexOf(marker);
  var folderPath = '';

  if (folderIndex !== -1) {
    folderPath = path.slice(folderIndex + marker.length);
  } else if (path === '/folder') {
    folderPath = '';
  }

  folderPath = folderPath
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .replace(/\/+$/, '');

  return folderPath ? folderPath + '/' : '';
}

function applyCurrentFolderPrefix(relativePath) {
  var normalizedRelativePath = String(relativePath || '')
    .replace(/\\/g, '/')
    .replace(/^\/+/, '');

  return currentFolderPrefix + normalizedRelativePath;
}

function buildUploadFormData(collectedFiles, options) {
  var formData = new FormData();
  var relativePaths = [];
  var dryRun = !!(options && options.dryRun);

  collectedFiles.forEach(function (entry, index) {
    var field = 'upload-' + index;
    var relativePath = applyCurrentFolderPrefix(entry.relativePath);

    formData.append(field, entry.file, entry.file.name);
    relativePaths.push({
      field: field,
      index: 0,
      relativePath: relativePath
    });
  });

  formData.append('relativePaths', JSON.stringify(relativePaths));
  formData.append('overwrite', 'true');
  formData.append('dryRun', dryRun ? 'true' : 'false');
  formData.append('_csrf', csrfToken);

  return formData;
}

function clearList(list) {
  if (list) list.innerHTML = '';
}

function renderList(list, items, mapFn) {
  clearList(list);
  if (!list || !items || !items.length) return;

  items.forEach(function (item) {
    var li = document.createElement('li');

    if (mapFn) {
      var mapped = mapFn(item, li);
      if (typeof mapped === 'string') li.textContent = mapped;
    } else {
      li.innerHTML = '<span class="icon-file-check"></span> ' + item;
    }

    list.appendChild(li);
  });
}

function renderUploadPreview(collectedFiles, preview) {
  var overwritePaths = (preview && preview.overwrite) || [];
  var overwriteSet = new Set(overwritePaths);

  renderList(uploadModalLists.queued, collectedFiles, function (entry, li) {
    var relativePath = entry.relativePath;
    var prefixedRelativePath = applyCurrentFolderPrefix(relativePath);

    li.textContent = relativePath;

    if (overwriteSet.has(prefixedRelativePath)) {
      var marker = document.createElement('span');
      marker.className = 'upload-preview-overwrite-marker';
      marker.textContent = 'Will overwrite existing file';
      li.appendChild(document.createTextNode(' '));
      li.appendChild(marker);
    }
  });
}

function resetUploadModalButtonState() {
  if (!uploadModal || typeof uploadModal.querySelectorAll !== 'function') return;
  Array.from(uploadModal.querySelectorAll('[data-upload-action]')).forEach(function (actionButton) {
    actionButton.disabled = false;
    actionButton.classList.remove('working');
  });
}

function openUploadModal() {
  if (!uploadModal) return;
  resetUploadModalButtonState();
  uploadModal.hidden = false;
  document.body.classList.add('upload-modal-open');
}

function closeUploadModal() {
  if (!uploadModal) return;
  uploadModal.hidden = true;
  document.body.classList.remove('upload-modal-open');
  resetUploadModalButtonState();
}

function collectFailures(result) {
  var failures = [];

  ((result && result.results) || []).forEach(function (entry) {
    if (entry.skipped) {
      failures.push(entry.path + ' — skipped (overwrite disabled)');
    } else if (entry.local && entry.local.success === false) {
      failures.push(entry.path + ' — local write failed: ' + (entry.local.error || 'Unknown error'));
    } else if (entry.client && entry.client.success === false) {
      failures.push(entry.path + ' — remote sync failed: ' + (entry.client.error || 'Unknown error'));
    }
  });

  ((result && result.rejected) || []).forEach(function (entry) {
    var label = entry.relativePath || entry.filename || '(unknown file)';
    failures.push(label + ' — rejected: ' + (entry.reason || 'unknown'));
  });

  return failures;
}

function commitUpload(collectedFiles) {
  if (!uploadUrl) {
    return Promise.reject(new Error('Missing upload URL'));
  }

  return fetch(uploadUrl, {
    method: 'POST',
    body: buildUploadFormData(collectedFiles, { dryRun: false })
  })
    .then(function (response) {
      if (!response.ok) throw new Error('Upload failed');
      return response.json();
    })
    .then(function (result) {
      collectFailures(result);
      closeUploadModal();
      refreshFolderContents();
    });
}

function uploadDroppedFiles(collectedFiles) {
  if (!collectedFiles.length) return Promise.resolve();
  if (!uploadUrl) return Promise.reject(new Error('Missing upload URL'));

  return fetch(uploadUrl + '?dryRun=1', {
    method: 'POST',
    body: buildUploadFormData(collectedFiles, { dryRun: true })
  })
    .then(function (response) {
      if (!response.ok) throw new Error('Upload dry-run failed');
      return response.json();
    })
    .then(function (preview) {
      renderUploadPreview(collectedFiles, preview);
      openUploadModal();

      return new Promise(function (resolve, reject) {
        var finished = false;
        var isSubmitting = false;

        function setModalActionButtonsDisabled(disabled) {
          if (!uploadModal || typeof uploadModal.querySelectorAll !== 'function') return;
          Array.from(uploadModal.querySelectorAll('[data-upload-action]')).forEach(function (actionButton) {
            actionButton.disabled = disabled;
          });
        }

        function cleanup() {
          if (uploadModal) uploadModal.removeEventListener('click', onClick);
        }

        function finish(done, value) {
          if (finished) return;
          finished = true;
          cleanup();
          done(value);
        }

        function onClick(event) {
          if (isSubmitting) return;

          var close = event.target.closest('[data-upload-modal-close]');
          if (close) {
            closeUploadModal();
            finish(resolve);
            return;
          }

          var button = event.target.closest('[data-upload-action]');
          if (!button) return;

          var action = button.getAttribute('data-upload-action');
          if (action === 'cancel') {
            closeUploadModal();
            finish(resolve);
            return;
          }

          if (action !== 'upload') return;

          isSubmitting = true;
          setModalActionButtonsDisabled(true);

          commitUpload(collectedFiles).then(function () {
            isSubmitting = false;
            setModalActionButtonsDisabled(false);
            finish(resolve);
          }).catch(function (err) {
            isSubmitting = false;
            setModalActionButtonsDisabled(false);
            finish(reject, err);
          });
        }

        if (uploadModal) {
          uploadModal.addEventListener('click', onClick);
        } else {
          finish(resolve);
        }
      });
    });
}

var dragDepth = 0;

function resetDropState() {
  dragDepth = 0;
  hideDropTarget();
}

window.addEventListener('dragover', function (event) {
  if (isFileDropEvent(event)) {
    event.preventDefault();
  }
});

window.addEventListener('drop', function (event) {
  event.preventDefault();

  resetDropState();

  if (!isFileDropEvent(event)) {
    return;
  }

  collectDroppedFiles(event.dataTransfer)
    .then(uploadDroppedFiles)
    .catch(function (error) {
      console.error(error);
    });
});

if (dropTarget) {
  folderBox.addEventListener('dragenter', function (event) {
    if (!isFileDropEvent(event)) return;
    event.preventDefault();
    dragDepth += 1;
    showDropTarget();
  });

  folderBox.addEventListener('dragover', function (event) {
    if (!isFileDropEvent(event)) return;
    event.preventDefault();
    showDropTarget();
  });

  folderBox.addEventListener('dragleave', function (event) {
    if (!isFileDropEvent(event)) return;
    event.preventDefault();
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0) {
      hideDropTarget();
    }
  });

  folderBox.addEventListener('drop', function (event) {
    event.preventDefault();
    resetDropState();
  });
}

Array.from(table.querySelectorAll('th')).forEach(function (header) {
  header.addEventListener('mousedown', function (event) {
    if (event.target.classList.contains('resize-handle')) {
      return;
    }

    var reverse = header.classList.contains('sorted') && !header.classList.contains('reverse');

    state.column = Array.from(header.parentNode.children).indexOf(header);
    state.order = reverse ? 'reverse' : 'sorted';

    sortTable();

    localStorage.setItem('sort-column', state.column);
    localStorage.setItem('sort-order', state.order);
  });
});

Array.from(table.querySelectorAll('th:not(:last-child)')).forEach(function (th) {
  var handle = document.createElement('span');
  handle.className = 'resize-handle';
  th.appendChild(handle);
});

Array.from(table.querySelectorAll('th .resize-handle')).forEach(function (handle) {
  handle.addEventListener('mousedown', function (event) {
    var th = handle.parentNode;
    var nextTh = th.nextElementSibling;
    var startX = event.clientX;
    var startWidth = th.offsetWidth;
    var tableWidth = th.parentNode.offsetWidth;

    document.addEventListener('mousemove', resizeColumn);
    document.addEventListener('mouseup', stopResize);

    function resizeColumn(moveEvent) {
      var width = startWidth + (moveEvent.clientX - startX);
      var currentWidthPercentage = parseFloat(th.style.width.slice(0, -1));

      th.style.width = (width / tableWidth) * 100 + '%';
      var widthDeltaInPercentage = currentWidthPercentage - parseFloat(th.style.width.slice(0, -1));
      var currentNextWidthPercentage = parseFloat(nextTh.style.width.slice(0, -1));

      nextTh.style.width = (currentNextWidthPercentage + widthDeltaInPercentage) + '%';
    }

    function stopResize() {
      document.removeEventListener('mousemove', resizeColumn);
      document.removeEventListener('mouseup', stopResize);

      var index = Array.from(th.parentNode.children).indexOf(th);
      localStorage.setItem('column-width-' + index, (th.offsetWidth / tableWidth) * 100 + '%');
      localStorage.setItem('column-width-' + (index + 1), (nextTh.offsetWidth / tableWidth) * 100 + '%');
    }
  });
});
