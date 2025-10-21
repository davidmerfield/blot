const assert = require('assert');
const path = require('path');
const Module = require('module');

process.env.NODE_PATH = path.resolve(__dirname, '../../../..');
Module._initPaths();

const routerPath = path.resolve(__dirname, '../index.js');
const parentModule = new Module(routerPath);
parentModule.filename = routerPath;
parentModule.paths = Module._nodeModulePaths(path.dirname(routerPath));

const mocks = new Map();
const originalLoad = Module._load;

function mock(request, exports) {
  const resolved = Module._resolveFilename(request, parentModule);
  mocks.set(resolved, exports);
}

Module._load = function (request, parent, isMain) {
  const resolved = Module._resolveFilename(request, parent || parentModule, isMain);
  if (mocks.has(resolved)) return mocks.get(resolved);
  return originalLoad(request, parent, isMain);
};

const noop = (req, res, next) => (typeof next === 'function' ? next() : undefined);
const noopParam = (req, res, next) => (typeof next === 'function' ? next() : undefined);

mock('models/template', {
  metadataModel: {},
  update: (blogId, slug, data, callback) => callback && callback(),
  setMetadata: (id, data, callback) => callback && callback(),
  getAllViews: (id, callback) => callback && callback(null, {}, { slug: 'mock-template' }),
  package: { generate: () => '{}' },
  writeToFolder: (blogId, templateId, callback) => callback && callback(),
  drop: (blogId, slug, callback) => callback && callback(),
  createShareID: (id, callback) => callback && callback(),
  dropShareID: (id, callback) => callback && callback(),
  create: (owner, name, callback) => callback && callback(null, { slug: 'new-template' }),
});

mock('models/blog', {
  set: (blogId, updates, callback) => callback && callback(),
});

mock('./templates', noop);
mock('./load/template-views', noopParam);
mock('./load/template-view', noopParam);
mock('./load/template', noopParam);
mock('./load/font-inputs', noop);
mock('./load/syntax-highlighter', noop);
mock('./load/color-inputs', noop);
mock('./load/index-inputs', noop);
mock('./load/navigation-inputs', noop);
mock('./load/dates', noop);
mock('./save/fork-if-needed', noop);
mock('./save/previewPath', noop);
mock('./save/layout-inputs', noop);
mock('dashboard/site/load/menu', noop);

let capturedTemplate;

mock('./save/create-template', async (template) => {
  capturedTemplate = template;
  assert.strictEqual(template.name, 'Fancy Display Name copy');
  assert.ok(!Object.prototype.hasOwnProperty.call(template, 'slug'));
  return { slug: 'template-by-id', name: template.name };
});

mock('helper/formJSON', () => ({ locals: {}, partials: {} }));

async function run() {
  try {
    const router = require(routerPath);
    const duplicateLayer = router.stack.find(
      (layer) => layer.route && layer.route.path === '/:templateSlug/duplicate'
    );

    assert(duplicateLayer, 'Duplicate route not found');

    const postHandler = duplicateLayer.route.stack.find(
      (layer) => layer.method === 'post'
    ).handle;

    const req = {
      blog: { id: 'blog_1', handle: 'my-blog' },
      template: { id: 'template_1', name: 'Fancy Display Name', slug: 'fancy-template' },
    };

    const messages = [];
    const res = {
      message(url, text) {
        messages.push({ url, text });
      },
      locals: {},
    };

    await postHandler(req, res, (err) => {
      if (err) throw err;
      throw new Error('next() should not be called');
    });

    assert.strictEqual(capturedTemplate.owner, req.blog.id);
    assert.strictEqual(messages.length, 1, 'Expected a single flash message');
    assert.strictEqual(
      messages[0].url,
      '/sites/my-blog/template/template-by-id',
      'Redirect should use slug from createTemplate'
    );

    console.log('Duplicate template route regression test passed.');
  } finally {
    Module._load = originalLoad;
  }
}

run().catch((error) => {
  Module._load = originalLoad;
  console.error(error);
  process.exitCode = 1;
});
