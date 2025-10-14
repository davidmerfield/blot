const fs = require("fs-extra");
const { extname, dirname, join, basename } = require("path");
const titlify = require("build/prepare/titlify");
const ensure = require("helper/ensure");
const LocalPath = require("helper/localPath");
const hash = require("helper/hash");
const sharp = require("sharp");
const config = require("config");

const EXTENSIONS_TO_CONVERT = [".tif", ".tiff", ".webp", ".avif", ".heic"];
const SUPPORTED_EXTENSIONS = [".png", ".jpg", ".jpeg", ".gif", ...EXTENSIONS_TO_CONVERT];


function is(path) {
  return SUPPORTED_EXTENSIONS.includes(extname(path).toLowerCase());
}

function read(blog, path, callback) {
  ensure(blog, "object")
    .and(path, "string")
    .and(callback, "function");

  const localPath = LocalPath(blog.id, path);
  // if we need to convert the image to another format, store the converted image in the asset directory
  const assetDirectory = join(config.blog_static_files_dir, blog.id);
  
  fs.stat(localPath, async (err, stat) => {
    if (err) return callback(err);

    const name = basename(path);
    const pathForTitle = join(dirname(path), name);
    const title = titlify(pathForTitle);
    const isRetina = path.toLowerCase().includes("@2x") ? 'data-2x="true"' : "";

    if (EXTENSIONS_TO_CONVERT.includes(extname(path).toLowerCase())) {
      const convertedPath = join("/_assets", hash(path), `${name}.png`);
      // ensure asset directory exists
      await fs.ensureDir(join(assetDirectory, "_assets", hash(path)));
      // remove any existing converted image
      await fs.remove(join(assetDirectory, convertedPath));
      try {
        await sharp(localPath).png().toFile(join(assetDirectory, convertedPath));
      } catch (e) {
        return callback(e);
      }

      path = convertedPath;
    }

    const contents = `<img src="${encodeURI(path)}" title="${title}" alt="${title}" ${isRetina}/>`;
    
    callback(null, contents, stat);
  });
}

module.exports = { is, read, id: "img" };
