const fs = require("fs-extra");
const { join, extname } = require("path");
const hash = require("helper/hash");
const fetch = require("node-fetch");
const sharp = require("sharp");
const mime = require("mime-types");

async function processImages($, assetDir, docPath, transformer) {
  const docHash = hash(docPath);
  const images = [];

  $("img").each(function (i, elem) {
    images.push(elem);
  });

  await fs.ensureDir(assetDir);

  for (const elem of images) {
    const src = $(elem).attr("src");

    try {
      let buffer;
      let ext;
      let filename;

      if (src && src.startsWith("data:")) {
        const commaIndex = src.indexOf(",");

        if (commaIndex === -1) {
          continue;
        }

        const metadataPart = src.slice(5, commaIndex);
        const dataPart = src.slice(commaIndex + 1);
        const metadataParts = metadataPart.split(";");
        const mimeType = metadataParts.shift() || "";
        const isBase64 = metadataParts.includes("base64");

        try {
          buffer = Buffer.from(
            isBase64 ? dataPart : decodeURIComponent(dataPart),
            isBase64 ? "base64" : "utf8"
          );
        } catch (err) {
          console.log(err);
          continue;
        }

        if (mimeType) {
          ext = mime.extension(mimeType);
        }

        if (!ext) {
          const metadata = await sharp(buffer).metadata();
          ext = metadata.format;
        }
      } else if (transformer) {
        const filenameBase = hash(src);
        const metadataPath = join(assetDir, `${filenameBase}.meta.json`);

        let result;

        try {
          result = await lookupWithTransformer(
            transformer,
            src,
            (resolvedPath, done) => {
              determineExtension(resolvedPath)
                .then((determinedExt) => {
                  const computedFilename = `${filenameBase}.${determinedExt}`;
                  const destination = join(assetDir, computedFilename);

                  return fs
                    .pathExists(destination)
                    .then((exists) =>
                      exists ? null : fs.copy(resolvedPath, destination)
                    )
                    .then(() =>
                      fs.writeJson(
                        metadataPath,
                        { filename: computedFilename },
                        { spaces: 2 }
                      )
                    )
                    .then(() => done(null, { filename: computedFilename }));
                })
                .catch(done);
            }
          );
        } catch (err) {
          result = await fs.readJson(metadataPath).catch(() => null);

          if (!result || !result.filename) {
            console.log(err);
            continue;
          }
        }

        filename = result && result.filename;

        if (!filename) continue;

        const destination = join(assetDir, filename);

        if (!(await fs.pathExists(destination))) {
          console.log(new Error("Missing cached file for " + src));
          continue;
        }
      } else {
        const res = await fetch(src);
        const disposition = res.headers.get("content-disposition");
        buffer = await res.buffer();

        try {
          ext = disposition
            .split(";")
            .find((i) => i.includes("filename"))
            .split("=")
            .pop()
            .replace(/"/g, "")
            .split(".")
            .pop();
        } catch (err) {}

        if (!ext) {
          const metadata = await sharp(buffer).metadata();
          ext = metadata.format;
        }
      }

      if (buffer) {
        filename = hash(src) + "." + ext;
        await fs.outputFile(join(assetDir, filename), buffer);
      }

      if (!filename) continue;

      $(elem).attr("src", "/_assets/" + docHash + "/" + filename);
    } catch (err) {
      console.log(err);
    }
  }
}

function lookupWithTransformer(transformer, src, transform) {
  return new Promise((resolve, reject) => {
    transformer.lookup(src, transform, (err, result) => {
      if (err) return reject(err);
      resolve(result);
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
