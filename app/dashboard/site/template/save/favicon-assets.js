const fs = require("fs-extra");
const os = require("os");
const { join } = require("path");
const sharp = require("sharp");
const toIco = require("to-ico");
const uuid = require("uuid/v4");

const ICO_SIZES = [16, 32, 48];
const PNG_SIZES = { png16: 16, png32: 32, appleTouch: 180 };
const MAX_PIXELS = 100 * 1000 * 1000;

function badRequest(message) {
  const error = new Error(message);
  error.status = 400;
  return error;
}

function cropFor(metadata, crop) {
  const width = metadata.width;
  const height = metadata.height;
  if (!width || !height || width * height > MAX_PIXELS) {
    throw badRequest("Please choose a reasonably sized image");
  }

  const fallbackSize = Math.min(width, height);
  if (!crop || crop.x === undefined) {
    return {
      left: Math.floor((width - fallbackSize) / 2),
      top: Math.floor((height - fallbackSize) / 2),
      width: fallbackSize,
      height: fallbackSize,
    };
  }

  const x = Number(crop.x);
  const y = Number(crop.y);
  const size = Number(crop.size);
  if (![x, y, size].every(Number.isFinite) || x < 0 || y < 0 || size <= 0 || x > 1 || y > 1 || size > 1) {
    throw badRequest("The selected favicon crop is invalid");
  }

  const left = Math.floor(x * width);
  const top = Math.floor(y * height);
  const side = Math.floor(size * Math.min(width, height));
  if (side < 1 || left + side > width || top + side > height) {
    throw badRequest("The selected favicon crop is outside the image");
  }

  return { left, top, width: side, height: side };
}

async function generate(sourcePath, outputDirectory, crop) {
  let metadata;
  try {
    metadata = await sharp(sourcePath, { pages: 1 }).metadata();
  } catch (_) {
    throw badRequest("Please choose an image for your favicon");
  }

  const extraction = cropFor(metadata, crop);
  const id = uuid();
  const prefix = `favicon-${id}`;
  const workDirectory = await fs.mkdtemp(join(os.tmpdir(), "blot-favicon-"));

  try {
    const source = sharp(sourcePath, { pages: 1 }).extract(extraction).png();
    const icoBuffers = await Promise.all(
      ICO_SIZES.map((size) => source.clone().resize(size, size).png().toBuffer())
    );
    await fs.writeFile(join(workDirectory, `${prefix}.ico`), await toIco(icoBuffers));
    await Promise.all(Object.entries(PNG_SIZES).map(([name, size]) =>
      source.clone().resize(size, size).png().toFile(join(workDirectory, `${prefix}-${size}.png`))
    ));

    await fs.ensureDir(outputDirectory);
    await Promise.all([
      fs.move(join(workDirectory, `${prefix}.ico`), join(outputDirectory, `${prefix}.ico`)),
      ...Object.values(PNG_SIZES).map((size) =>
        fs.move(join(workDirectory, `${prefix}-${size}.png`), join(outputDirectory, `${prefix}-${size}.png`))
      ),
    ]);

    return { id, prefix, crop: extraction };
  } finally {
    await fs.remove(workDirectory);
  }
}

module.exports = { generate, cropFor, ICO_SIZES, PNG_SIZES };
