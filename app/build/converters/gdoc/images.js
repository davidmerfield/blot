const fs = require("fs-extra");
const { join } = require("path");
const hash = require("helper/hash");
const fetch = require("node-fetch");
const sharp = require("sharp");
const mime = require("mime-types");

async function processImages($, assetDir, docPath) {
  const docHash = hash(docPath);
  const images = [];

  $("img").each(function (i, elem) {
    images.push(elem);
  });

  for (const elem of images) {
    const src = $(elem).attr("src");

    try {
      let buffer;
      let ext;

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

      if (!buffer) continue;

      const filename = hash(src) + "." + ext;
      await fs.outputFile(join(assetDir, filename), buffer);
      $(elem).attr("src", "/_assets/" + docHash + "/" + filename);
    } catch (err) {
      console.log(err);
    }
  }
}

module.exports = processImages;
