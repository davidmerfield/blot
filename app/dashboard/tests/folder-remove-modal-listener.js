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

function extractInlineFunction(source, signature) {
  const start = source.indexOf(signature);
  if (start === -1) {
    throw new Error(`Could not find signature: ${signature}`);
  }

  const functionStart = source.indexOf('function', start);
  const braceStart = source.indexOf('{', functionStart);
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

  return source.slice(functionStart, end);
}

describe('folder directory remove modal behavior', function () {
  it('opens remove modal from menu, closes on cancel without fetch, submits remove and refreshes content', async function () {
    const templatePath = path.join(__dirname, '../../views/dashboard/folder/directory.html');
    const templateSource = fs.readFileSync(templatePath, 'utf8');

    const resolveMenuRemovePathSource = extractNamedFunction(templateSource, 'resolveMenuRemovePath');
    const openRemoveModalSource = extractNamedFunction(templateSource, 'openRemoveModal');
    const closeRemoveModalSource = extractNamedFunction(templateSource, 'closeRemoveModal');
    const resetRemoveModalButtonStateSource = extractNamedFunction(templateSource, 'resetRemoveModalButtonState');
    const setRemoveModalButtonsDisabledSource = extractNamedFunction(templateSource, 'setRemoveModalButtonsDisabled');
    const commitRemoveSource = extractNamedFunction(templateSource, 'commitRemove');
    const handleRemoveMenuClickSource = extractNamedFunction(templateSource, 'handleRemoveMenuClick');
    const handleRemoveModalClickSource = extractNamedFunction(templateSource, 'handleRemoveModalClick');

    const modalButtons = [
      { disabled: false, getAttribute: (name) => (name === 'data-remove-action' ? 'remove' : null) },
      { disabled: false, getAttribute: (name) => (name === 'data-remove-action' ? 'cancel' : null) },
    ];

    const pathLabel = { textContent: '' };
    const removeModal = {
      hidden: true,
      querySelector: (selector) => (selector === '[data-remove-path-label]' ? pathLabel : null),
      querySelectorAll: (selector) => (selector === '[data-remove-action]' ? modalButtons : []),
    };

    const fetchCalls = [];
    let refreshCount = 0;

    const context = {
      Promise,
      removeModal,
      removeTargetPath: null,
      csrfToken: 'token',
      fetch: (url, options) => {
        fetchCalls.push({ url, options });
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true }) });
      },
      refreshFolderContents: () => {
        refreshCount += 1;
      },
      '{{{base}}}': '',
    };

    vm.runInNewContext(
      `${resolveMenuRemovePathSource}
${resetRemoveModalButtonStateSource}
${setRemoveModalButtonsDisabledSource}
${openRemoveModalSource}
${closeRemoveModalSource}
${commitRemoveSource}
${handleRemoveMenuClickSource}
${handleRemoveModalClickSource}
this.handleRemoveMenuClick = handleRemoveMenuClick;
this.handleRemoveModalClick = handleRemoveModalClick;`,
      context
    );

    const preventDefault = jasmine.createSpy('preventDefault');
    context.handleRemoveMenuClick({
      preventDefault,
      target: {
        closest: (selector) => {
          if (selector === '[data-menu-link="remove"]') {
            return { getAttribute: () => 'action:remove-file:posts%2Fhello.md' };
          }
          return null;
        },
      },
    });

    expect(preventDefault).toHaveBeenCalled();
    expect(removeModal.hidden).toBe(false);
    expect(pathLabel.textContent).toBe('posts/hello.md');

    context.handleRemoveModalClick({
      target: {
        closest: (selector) => {
          if (selector === '[data-remove-modal-close]') return null;
          if (selector === '[data-remove-action]') {
            return { disabled: false, getAttribute: () => 'cancel' };
          }
          return null;
        },
      },
    });

    expect(removeModal.hidden).toBe(true);
    expect(fetchCalls.length).toBe(0);

    context.handleRemoveMenuClick({
      preventDefault: () => {},
      target: {
        closest: (selector) => {
          if (selector === '[data-menu-link="remove"]') {
            return { getAttribute: () => 'action:remove-file:posts%2Fhello.md' };
          }
          return null;
        },
      },
    });

    context.handleRemoveModalClick({
      target: {
        closest: (selector) => {
          if (selector === '[data-remove-modal-close]') return null;
          if (selector === '[data-remove-action]') {
            return { disabled: false, getAttribute: () => 'remove' };
          }
          return null;
        },
      },
    });

    await Promise.resolve();
    await Promise.resolve();
    await new Promise((resolve) => setImmediate(resolve));

    expect(fetchCalls.length).toBe(1);
    expect(fetchCalls[0].url).toBe('{{{base}}}/folder/remove/posts%2Fhello.md');
    expect(refreshCount).toBe(1);
    expect(removeModal.hidden).toBe(true);
  });

  it('locks remove modal buttons during in-flight request and unlocks on failure', async function () {
    const flush = () => new Promise((resolve) => setImmediate(resolve));
    const templatePath = path.join(__dirname, '../../views/dashboard/folder/directory.html');
    const templateSource = fs.readFileSync(templatePath, 'utf8');

    const setRemoveModalButtonsDisabledSource = extractNamedFunction(templateSource, 'setRemoveModalButtonsDisabled');
    const resetRemoveModalButtonStateSource = extractNamedFunction(templateSource, 'resetRemoveModalButtonState');
    const openRemoveModalSource = extractNamedFunction(templateSource, 'openRemoveModal');
    const handleRemoveModalClickSource = extractNamedFunction(templateSource, 'handleRemoveModalClick');

    const modalButtons = [
      { disabled: false, getAttribute: (name) => (name === 'data-remove-action' ? 'remove' : null) },
      { disabled: false, getAttribute: (name) => (name === 'data-remove-action' ? 'cancel' : null) },
    ];

    const removeModal = {
      hidden: true,
      querySelector: () => ({ textContent: '' }),
      querySelectorAll: (selector) => (selector === '[data-remove-action]' ? modalButtons : []),
    };

    let rejectCommit;
    const context = {
      Promise,
      removeModal,
      removeTargetPath: null,
      commitRemove: () =>
        new Promise((resolve, reject) => {
          rejectCommit = reject;
        }),
    };

    vm.runInNewContext(
      `${resetRemoveModalButtonStateSource}
${setRemoveModalButtonsDisabledSource}
${openRemoveModalSource}
${handleRemoveModalClickSource}
this.openRemoveModal = openRemoveModal;
this.handleRemoveModalClick = handleRemoveModalClick;`,
      context
    );

    context.openRemoveModal('drafts/a.md');
    context.handleRemoveModalClick({
      target: {
        closest: (selector) => {
          if (selector === '[data-remove-modal-close]') return null;
          if (selector === '[data-remove-action]') {
            return { disabled: false, getAttribute: () => 'remove' };
          }
          return null;
        },
      },
    });

    modalButtons.forEach((button) => {
      expect(button.disabled).toBe(true);
    });

    rejectCommit(new Error('boom'));
    await flush();

    modalButtons.forEach((button) => {
      expect(button.disabled).toBe(false);
    });
  });
});

describe('folder directory remove action state', function () {
  it('keeps remove action disabled for entry rows', function () {
    const templatePath = path.join(__dirname, '../../views/dashboard/folder/directory.html');
    const templateSource = fs.readFileSync(templatePath, 'utf8');

    const removeLinkResolverSource = extractInlineFunction(
      templateSource,
      "remove: function (dataset)"
    );

    const context = {};

    vm.runInNewContext(
      `var removeResolver = ${removeLinkResolverSource};\nthis.removeResolver = removeResolver;`,
      context
    );

    const entryResult = context.removeResolver({
      directory: 'false',
      entry: 'true',
      url: '/entry.md',
    });

    const fileResult = context.removeResolver({
      directory: 'false',
      entry: 'false',
      url: '/plain.md',
    });

    expect(entryResult.disabled).toBe(true);
    expect(fileResult.disabled).toBe(false);
    expect(fileResult.href).toContain('action:remove-file:');
  });
});
