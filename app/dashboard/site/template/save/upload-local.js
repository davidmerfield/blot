const multiparty = require("multiparty");
const fs = require("fs-extra");
const { join, extname } = require("path");
const uuid = require("uuid/v4");
const config = require("config");
const Template = require("models/template");
const tempDir = require("helper/tempDir")();

const MAX_FILE_SIZE = 30 * 1024 * 1024; // 30mb
const FORM_OPTIONS = { uploadDir: tempDir, maxFilesSize: MAX_FILE_SIZE };

const parseForm = (req) =>
  new Promise((resolve, reject) => {
    const form = new multiparty.Form(FORM_OPTIONS);

    form.parse(req, (err, fields, files) => {
      if (err) {
        if (err.code === "ETOOBIG") {
          err.status = 413;
        }
        return reject(err);
      }

      resolve({ fields, files });
    });
  });

const normalizeFields = (fields = {}) =>
  Object.keys(fields).reduce((acc, key) => {
    const value = fields[key];
    acc[key] = Array.isArray(value) ? value[0] : value;
    return acc;
  }, {});

const firstFile = (files = {}) => {
  for (const key of Object.keys(files)) {
    const list = files[key];
    if (Array.isArray(list) && list.length) {
      return list[0];
    }
  }
  return null;
};

const cleanupFiles = async (files = {}) => {
  const removals = [];
  for (const key of Object.keys(files)) {
    for (const file of files[key]) {
      if (file && file.path) {
        removals.push(fs.remove(file.path).catch(() => {}));
      }
    }
  }
  await Promise.all(removals);
};

const updateTemplate = (blogID, templateSlug, locals) =>
  new Promise((resolve, reject) => {
    Template.update(blogID, templateSlug, { locals }, (err) => {
      if (err) return reject(err);
      resolve();
    });
  });

module.exports = async (req, res, next) => {
  const key = req.params.key;

  if (!key || !/_url$/i.test(key)) {
    return res.status(400).json({ error: "Invalid upload key" });
  }

  if (!req.template.locals || !Object.prototype.hasOwnProperty.call(req.template.locals, key)) {
    return res.status(400).json({ error: "Unknown template field" });
  }

  let parsed;
  try {
    parsed = await parseForm(req);
  } catch (err) {
    if (err.status === 413 || err.code === "ETOOBIG") {
      return res
        .status(413)
        .json({ error: "File too large. Maximum size is 30MB." });
    }
    return next(err);
  }

  const { fields, files } = parsed;
  const normalizedFields = normalizeFields(fields);

  if (!normalizedFields._url || normalizedFields._url !== key) {
    await cleanupFiles(files);
    return res.status(400).json({ error: "Mismatched upload key" });
  }

  const file = firstFile(files);

  if (!file || !file.size) {
    await cleanupFiles(files);
    return res.status(400).json({ error: "No file uploaded" });
  }

  const templateDir = join(
    config.blog_static_files_dir,
    "template_assets",
    req.blog.id,
    req.params.templateSlug
  );

  const extension = extname(file.originalFilename || file.path).toLowerCase();
  const filename = `${uuid()}${extension}`;
  const finalPath = join(templateDir, filename);

  try {
    await fs.ensureDir(templateDir);
    await fs.move(file.path, finalPath, { overwrite: true });
    await cleanupFiles(files);
  } catch (err) {
    await cleanupFiles(files);
    return next(err);
  }

  const cdnUrl =
    `${config.cdn.origin}/template_assets/${req.blog.id}/${req.params.templateSlug}/` +
    encodeURIComponent(filename);

  req.template.locals[key] = cdnUrl;

  try {
    await updateTemplate(req.blog.id, req.params.templateSlug, req.template.locals);
  } catch (err) {
    await fs.remove(finalPath).catch(() => {});
    return next(err);
  }
  res.locals.template = req.template;

  res.json({ url: cdnUrl, key });
};
