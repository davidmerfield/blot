const fs = require('fs');
const path = require('path');
const vm = require('vm');

function extractNamedFunction(source, functionName) {
  const signature = `function ${functionName}(`;
  const start = source.indexOf(signature);

  if (start === -1) {
    throw new Error(`Could not find ${functionName} in template`);
  }

  const braceStart = source.indexOf('{', start);

  let depth = 0;
  let end = braceStart;

  for (; end < source.length; end += 1) {
    const char = source[end];
    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        end += 1;
        break;
      }
    }
  }

  return source.slice(start, end);
}

function createModalEvent(action) {
  const button = {
    disabled: false,
    getAttribute: (name) => (name === 'data-upload-action' ? action : null),
  };

  return {
    target: {
      closest: (selector) => {
        if (selector === '[data-upload-modal-close]') return null;
        if (selector === '[data-upload-action]') return button;
        return null;
      },
    },
  };
}

function createModalActionButtons(actions) {
  return actions.map((action) => ({
    disabled: false,
    getAttribute: (name) => (name === 'data-upload-action' ? action : null),
  }));
}

describe('folder directory upload modal listener lifecycle', function () {
  it('does not keep stale action listeners across upload attempts after partial failure', async function () {
    const flush = () => new Promise((resolve) => setImmediate(resolve));

    const templatePath = path.join(
      __dirname,
      '../../views/dashboard/folder/directory.html'
    );
    const templateSource = fs.readFileSync(templatePath, 'utf8');
    const uploadDroppedFilesSource = extractNamedFunction(
      templateSource,
      'uploadDroppedFiles'
    );

    const clickListeners = new Set();
    const uploadModal = {
      hidden: false,
      addEventListener: (event, handler) => {
        if (event === 'click') clickListeners.add(handler);
      },
      removeEventListener: (event, handler) => {
        if (event === 'click') clickListeners.delete(handler);
      },
    };

    let commitCount = 0;

    const context = {
      Promise,
      fetch: () =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ overwrite: ['existing.txt'] }),
        }),
      buildUploadFormData: () => ({}),
      renderUploadPreview: () => {},
      openUploadModal: () => {
        uploadModal.hidden = false;
      },
      closeUploadModal: () => {
        uploadModal.hidden = true;
      },
      uploadModal,
      commitUpload: () => {
        commitCount += 1;
        // Simulate partial-failure UX where modal remains visible.
        uploadModal.hidden = false;
        return Promise.resolve();
      },
      '{{{base}}}': '',
    };

    vm.runInNewContext(
      `${uploadDroppedFilesSource}\nthis.uploadDroppedFiles = uploadDroppedFiles;`,
      context
    );

    const collectedFiles = [{ file: { name: 'example.txt' }, relativePath: 'example.txt' }];

    const firstAttempt = context.uploadDroppedFiles(collectedFiles);
    await flush();
    clickListeners.forEach((handler) => handler(createModalEvent('safe')));
    await firstAttempt;

    expect(commitCount).toBe(1);
    expect(clickListeners.size).toBe(0);

    const secondAttempt = context.uploadDroppedFiles(collectedFiles);
    await flush();
    clickListeners.forEach((handler) => handler(createModalEvent('safe')));
    await secondAttempt;

    expect(commitCount).toBe(2);
    expect(clickListeners.size).toBe(0);
  });

  it('allows only one submit across rapid multi-clicks on different action buttons', async function () {
    const flush = () => new Promise((resolve) => setImmediate(resolve));

    const templatePath = path.join(
      __dirname,
      '../../views/dashboard/folder/directory.html'
    );
    const templateSource = fs.readFileSync(templatePath, 'utf8');
    const uploadDroppedFilesSource = extractNamedFunction(
      templateSource,
      'uploadDroppedFiles'
    );

    const clickListeners = new Set();
    const modalActionButtons = createModalActionButtons(['cancel', 'safe', 'overwrite']);
    const uploadModal = {
      hidden: false,
      querySelectorAll: (selector) => {
        if (selector === '[data-upload-action]') return modalActionButtons;
        return [];
      },
      addEventListener: (event, handler) => {
        if (event === 'click') clickListeners.add(handler);
      },
      removeEventListener: (event, handler) => {
        if (event === 'click') clickListeners.delete(handler);
      },
    };

    let commitCount = 0;
    let resolveCommit;

    const context = {
      Promise,
      fetch: () =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ overwrite: ['existing.txt'] }),
        }),
      buildUploadFormData: () => ({}),
      renderUploadPreview: () => {},
      openUploadModal: () => {
        uploadModal.hidden = false;
      },
      closeUploadModal: () => {
        uploadModal.hidden = true;
      },
      uploadModal,
      commitUpload: () => {
        commitCount += 1;
        return new Promise((resolve) => {
          resolveCommit = resolve;
        });
      },
      '{{{base}}}': '',
    };

    vm.runInNewContext(
      `${uploadDroppedFilesSource}\nthis.uploadDroppedFiles = uploadDroppedFiles;`,
      context
    );

    const collectedFiles = [{ file: { name: 'example.txt' }, relativePath: 'example.txt' }];
    const attempt = context.uploadDroppedFiles(collectedFiles);

    await flush();

    const listeners = Array.from(clickListeners);
    listeners.forEach((handler) => handler(createModalEvent('safe')));
    listeners.forEach((handler) => handler(createModalEvent('overwrite')));

    expect(commitCount).toBe(1);
    modalActionButtons.forEach((button) => {
      expect(button.disabled).toBe(true);
    });

    resolveCommit();
    await attempt;

    modalActionButtons.forEach((button) => {
      expect(button.disabled).toBe(false);
    });
  });
});
