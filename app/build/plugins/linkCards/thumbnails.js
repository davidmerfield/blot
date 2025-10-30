const { join } = require("path");
const crypto = require("crypto");
const fetch = require("node-fetch");
const sharp = require("sharp");
const fs = require("fs-extra");

const config = require("config");

const {
  THUMBNAIL_DIRECTORY,
  THUMBNAIL_WIDTHS,
  REQUEST_TIMEOUT,
} = require("./constants");
const { transformerLookup } = require("./transformers");

sharp.cache(false);

async function ensureThumbnails(metadata, blogID, transformer) {
  if (!blogID) {
    metadata.imageSet = null;
    metadata.image = metadata.remoteImage;
    return;
  }

  const remoteImage = metadata.remoteImage;
  if (!remoteImage) {
    await cleanupThumbnails(metadata.imageSet, blogID);
    metadata.imageSet = null;
    metadata.image = "";
    return;
  }

  if (
    metadata.imageSet &&
    metadata.imageSet.remote === remoteImage &&
    (await thumbnailsExist(metadata.imageSet, blogID))
  ) {
    applyPublicImagePaths(metadata, blogID);
    return;
  }

  await cleanupThumbnails(metadata.imageSet, blogID);

  const generated = await lookupThumbnails(remoteImage, blogID, transformer);

  if (!generated) {
    metadata.imageSet = null;
    metadata.image = remoteImage;
    return;
  }

  metadata.imageSet = generated;
  applyPublicImagePaths(metadata, blogID);
}

function applyPublicImagePaths(metadata, blogID) {
  const imageSet = metadata.imageSet;
  if (!imageSet || !Array.isArray(imageSet.items) || imageSet.items.length === 0) {
    metadata.imageSet = null;
    metadata.image = metadata.remoteImage;
    return;
  }

  const items = imageSet.items
    .map((item) =>
      Object.assign({}, item, {
        src: `${config.cdn.origin}/${blogID}/${item.path}`,
      })
    )
    .sort((a, b) => a.width - b.width);

  const src = items[items.length - 1].src;
  const srcset = items.map((item) => `${item.src} ${item.width}w`).join(", ");

  metadata.imageSet = Object.assign({}, imageSet, {
    items,
    src,
    srcset,
  });
  metadata.image = src;
}

async function thumbnailsExist(imageSet, blogID) {
  if (!imageSet || !Array.isArray(imageSet.items)) return false;

  const checks = await Promise.all(
    imageSet.items.map((item) => {
      const absolute = join(
        config.blog_static_files_dir,
        blogID,
        item.path
      );
      return fs.pathExists(absolute);
    })
  );

  return checks.every(Boolean);
}

async function cleanupThumbnails(imageSet, blogID) {
  if (!imageSet || !Array.isArray(imageSet.items)) return;

  await Promise.all(
    imageSet.items.map((item) => {
      const absolute = join(
        config.blog_static_files_dir,
        blogID,
        item.path
      );
      return fs.remove(absolute).catch(() => {});
    })
  );
}

async function lookupThumbnails(remoteImage, blogID, transformer) {
  const regenerate = async () => {
    const buffer = await fetchImageBuffer(remoteImage);
    if (!buffer) return null;
    return processThumbnails(buffer, remoteImage, blogID);
  };

  const result = await transformerLookup(
    transformer,
    remoteImage,
    createThumbnailTransform(blogID, remoteImage),
    regenerate
  );

  if (!result) return null;

  if (await thumbnailsExist(result, blogID)) {
    return result;
  }

  await cleanupThumbnails(result, blogID);

  return regenerate();
}

async function fetchImageBuffer(remoteImage) {
  try {
    const response = await fetch(remoteImage, {
      redirect: "follow",
      timeout: REQUEST_TIMEOUT,
      headers: {
        "user-agent": "Blot Link Cards (+https://blot.im)",
        accept: "image/*",
      },
    });

    if (!response.ok) return null;

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch (err) {
    return null;
  }
}

function createThumbnailTransform(blogID, remoteImage) {
  return function (path, callback) {
    fs.readFile(path)
      .then((buffer) => processThumbnails(buffer, remoteImage, blogID))
      .then((result) => {
        if (!result) return callback(new Error("No thumbnails"));
        callback(null, result);
      })
      .catch((err) => callback(err));
  };
}

async function processThumbnails(buffer, remoteImage, blogID) {
  try {
    const metadata = await sharp(buffer).metadata();

    const outputFormat = selectOutputFormat(metadata);
    if (!outputFormat) return null;

    const baseName = crypto
      .createHash("sha1")
      .update(remoteImage)
      .digest("hex");

    const directory = join(
      config.blog_static_files_dir,
      blogID,
      THUMBNAIL_DIRECTORY
    );

    await fs.ensureDir(directory);

    const usedWidths = new Set();
    const items = [];

    for (const candidate of THUMBNAIL_WIDTHS) {
      const targetWidth = determineTargetWidth(candidate, metadata.width);
      if (usedWidths.has(targetWidth)) continue;

      const filename = `${baseName}-${targetWidth}.${outputFormat}`;
      const absolutePath = join(directory, filename);

      await fs.remove(absolutePath).catch(() => {});

      const pipeline = sharp(buffer).resize({
        width: targetWidth,
        withoutEnlargement: true,
      });

      applyFormat(pipeline, outputFormat);

      const info = await pipeline.toFile(absolutePath);

      if (!info || !info.width) {
        await fs.remove(absolutePath).catch(() => {});
        continue;
      }

      usedWidths.add(info.width);

      items.push({
        width: info.width,
        height: info.height || null,
        path: `${THUMBNAIL_DIRECTORY}/${filename}`,
      });
    }

    if (items.length === 0) {
      return null;
    }

    return {
      remote: remoteImage,
      items,
    };
  } catch (err) {
    return null;
  }
}

function determineTargetWidth(candidate, originalWidth) {
  if (!originalWidth || !Number.isFinite(originalWidth)) return candidate;
  return Math.max(Math.min(candidate, Math.round(originalWidth)), 1);
}

function selectOutputFormat(metadata) {
  const allowed = new Set(["jpeg", "png", "webp", "avif"]);
  let format = metadata && metadata.format ? metadata.format.toLowerCase() : "";

  if (!allowed.has(format)) {
    format = metadata && metadata.hasAlpha ? "png" : "jpeg";
  }

  if (!allowed.has(format)) return null;

  return format === "jpeg" ? "jpg" : format;
}

function applyFormat(pipeline, format) {
  switch (format) {
    case "jpg":
      pipeline.jpeg({ quality: 80, progressive: true });
      break;
    case "png":
      pipeline.png({ compressionLevel: 9 });
      break;
    case "webp":
      pipeline.webp({ quality: 80 });
      break;
    case "avif":
      pipeline.avif({ quality: 70 });
      break;
    default:
      pipeline.jpeg({ quality: 80, progressive: true });
  }
}

module.exports = {
  ensureThumbnails,
  applyPublicImagePaths,
  thumbnailsExist,
  cleanupThumbnails,
  lookupThumbnails,
  fetchImageBuffer,
  createThumbnailTransform,
  processThumbnails,
};
