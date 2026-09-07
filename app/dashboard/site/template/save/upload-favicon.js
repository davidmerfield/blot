const fs = require("fs-extra");
const { join } = require("path");
const config = require("config");
const Template = require("models/template");
const cleanupFiles = require("./cleanup-files");
const { isAjaxRequest } = require("./ajax-response");
const { generate, PNG_SIZES } = require("./favicon-assets");

const faviconDirectory = (blog) => join(config.blog_static_files_dir, blog.id, "_template_assets");
const faviconURL = (blog, filename) => `${config.cdn.origin}/${blog.id}/_template_assets/${encodeURIComponent(filename)}`;

function firstFile(files = {}) {
  const list = files.favicon;
  return Array.isArray(list) ? list[0] : list;
}

function oldPaths(blog, favicon) {
  if (!favicon || !favicon.prefix || !/^favicon-[a-f0-9-]+$/.test(favicon.prefix)) return [];
  const dir = faviconDirectory(blog);
  return [
    join(dir, `${favicon.prefix}.ico`),
    ...Object.values(PNG_SIZES).map((size) => join(dir, `${favicon.prefix}-${size}.png`)),
  ];
}

const update = (blog, slug, locals) => new Promise((resolve, reject) =>
  Template.update(blog.id, slug, { locals }, (err) => err ? reject(err) : resolve())
);

module.exports = async function uploadFavicon(req, res, next) {
  const file = firstFile(req.files);
  const previous = req.template.locals.favicon;
  const isDelete = req.body.remove === "1";

  if (isDelete || !file || !file.size) {
    await cleanupFiles(req.files);
    delete req.template.locals.favicon;
    try {
      await update(req.blog, req.params.templateSlug, req.template.locals);
      await Promise.all(oldPaths(req.blog, previous).map((path) => fs.remove(path)));
    } catch (error) {
      return next(error);
    }
    return isAjaxRequest(req) ? res.json({ favicon: null }) : res.message(req.body.redirect || res.locals.base, "Removed favicon");
  }

  let created;
  try {
    created = await generate(file.path, faviconDirectory(req.blog), {
      x: req.body.crop_x,
      y: req.body.crop_y,
      size: req.body.crop_size,
    });
    await cleanupFiles(req.files);
  } catch (error) {
    await cleanupFiles(req.files);
    return next(error);
  }

  const favicon = {
    prefix: created.prefix,
    ico: faviconURL(req.blog, `${created.prefix}.ico`),
    png16: faviconURL(req.blog, `${created.prefix}-16.png`),
    png32: faviconURL(req.blog, `${created.prefix}-32.png`),
    appleTouch: faviconURL(req.blog, `${created.prefix}-180.png`),
  };
  req.template.locals.favicon = favicon;

  try {
    await update(req.blog, req.params.templateSlug, req.template.locals);
    await Promise.all(oldPaths(req.blog, previous).map((path) => fs.remove(path)));
  } catch (error) {
    await Promise.all(oldPaths(req.blog, favicon).map((path) => fs.remove(path)));
    return next(error);
  }

  return isAjaxRequest(req) ? res.json({ favicon }) : res.message(req.body.redirect || res.locals.base, "Updated favicon");
};
