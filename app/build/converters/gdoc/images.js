const Transformer = require("helper/transformer");
const fs = require("fs-extra");
const { join, extname } = require("path");
const hash = require("helper/hash");
const config = require("config");
const sharp = require("sharp");
const mime = require("mime-types");

async function processImages(blogID, docPath, $) {
  const docHash = hash(docPath);
  const blogDir = join(config.blog_static_files_dir, blogID);
  const assetDir = join(blogDir, "_assets", docHash);

  const transformer = new Transformer(blogID, "gdoc-images");

  const images = [];

  $("img").each(function (i, elem) {
    images.push(elem);
  });

  await fs.ensureDir(assetDir);

  const dataImages = images.filter((elem) => {
    const src = $(elem).attr("src");
    return src && src.startsWith("data:");
  });

  const nonDataImages = images.filter((elem) => {
    const src = $(elem).attr("src");
    return src && !src.startsWith("data:");
  });

  // Handle images which embed image data directly
  for (const elem of dataImages) {
    try {
      const src = $(elem).attr("src");

      let buffer;
      let ext;
      let filename;

      const commaIndex = src.indexOf(",");

      if (commaIndex === -1) {
        continue;
      }

      const metadataPart = src.slice(5, commaIndex);
      const dataPart = src.slice(commaIndex + 1);
      const metadataParts = metadataPart.split(";");
      const mimeType = metadataParts.shift() || "";
      const isBase64 = metadataParts.includes("base64");

      buffer = Buffer.from(
        isBase64 ? dataPart : decodeURIComponent(dataPart),
        isBase64 ? "base64" : "utf8"
      );

      if (mimeType) {
        ext = mime.extension(mimeType);
      }

      if (!ext) {
        const metadata = await sharp(buffer).metadata();
        ext = metadata.format;
      }

      filename = hash(src) + "." + ext;
      await fs.outputFile(join(assetDir, filename), buffer);

      $(elem).attr("src", "/_assets/" + docHash + "/" + filename);
    } catch (err) {
      console.log(err);
    }
  }

  // Handle images which reference external resources
  for (const elem of nonDataImages) {
    try {
      const src = $(elem).attr("src");
      const filenameBase = hash(src);

      const fetchImage = async (resolvedPath, done) => {
        console.log("Fetched image for gdoc:", src, resolvedPath);
        try {
          const determinedExt = await determineExtension(resolvedPath);

          const computedFilename = `${filenameBase}.${determinedExt}`;
          const destination = join(assetDir, computedFilename);

          await fs.copy(resolvedPath, destination);
          done(null, {
            output: "/_assets/" + docHash + "/" + computedFilename,
          });
        } catch (err) {
          done(err);
        }
      };

      const { output } = await lookupWithTransformer(
        transformer,
        src,
        fetchImage
      );

      $(elem).attr("src", output);
    } catch (err) {
      console.log(err);
    }
  }
}

function lookupWithTransformer(transformer, src, transform) {
  return new Promise((resolve, reject) => {
    transformer.lookup(src, transform, (err, result) => {
      if (result) {
        resolve(result);
      } else {
        reject(err || new Error("Image lookup failed for " + src));
      }
    });
  });
}

async function determineExtension(path) {
  let ext = extname(path).replace(/^\./, "").toLowerCase();

  if (!ext) {
    try {
      const metadata = await sharp(path).metadata();
      ext = metadata.format;
    } catch (err) {}
  }

  if (!ext) {
    throw new Error("Unable to determine extension for " + path);
  }

  return ext;
}

module.exports = processImages;
