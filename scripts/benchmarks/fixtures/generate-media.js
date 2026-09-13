#!/usr/bin/env node
"use strict";

/**
 * One-time generator for the small, fixed media pool used by the workload
 * generator's symlink trick (scripts/benchmarks/spec/util/workload.js).
 *
 * Produces a deterministic (fixed seed) set of genuinely small, genuinely
 * valid image files under scripts/benchmarks/fixtures/media/ so they can be
 * regenerated or audited later:
 *
 *   - several JPEG/PNG photos of varying dimensions, synthesized with sharp
 *     (gradients / noise / simple shapes - nothing copyrighted)
 *   - a handful of small animated GIFs, assembled from sharp-rendered frames
 *     via ImageMagick's `convert` (already used elsewhere in this dev
 *     environment; falls back to a static single-frame GIF if `convert`
 *     isn't on PATH)
 *   - a couple of hand-written trivial SVGs
 *
 * Run with: node scripts/benchmarks/fixtures/generate-media.js
 */

const path = require("path");
const fs = require("fs");
const os = require("os");
const { execFileSync } = require("child_process");
const sharp = require("sharp");
const seedrandom = require("seedrandom");

const SEED = "blot-benchmark-media-seed";
const OUT_DIR = path.join(__dirname, "media");

const rng = seedrandom(SEED);

function randInt(min, max) {
  return Math.floor(rng() * (max - min + 1)) + min;
}

function randChoice(arr) {
  return arr[Math.floor(rng() * arr.length)];
}

// A small, fixed palette so generated images look intentional rather than
// like raw noise.
const PALETTES = [
  [
    { r: 235, g: 87, b: 87 },
    { r: 242, g: 201, b: 76 },
    { r: 87, g: 176, b: 235 },
  ],
  [
    { r: 39, g: 174, b: 96 },
    { r: 242, g: 153, b: 74 },
    { r: 155, g: 89, b: 182 },
  ],
  [
    { r: 41, g: 128, b: 185 },
    { r: 44, g: 62, b: 80 },
    { r: 236, g: 240, b: 241 },
  ],
];

/**
 * Build one raw RGB buffer of width x height with a simple diagonal gradient
 * between two palette colors plus a bit of per-pixel noise, so every
 * generated photo looks distinct without needing any external asset.
 */
function gradientBuffer(width, height, colorA, colorB, noiseSeed) {
  const buffer = Buffer.alloc(width * height * 3);
  const localRng = seedrandom(String(noiseSeed));

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const t = (x / width + y / height) / 2;
      const noise = (localRng() - 0.5) * 6;

      const i = (y * width + x) * 3;
      buffer[i] = clamp(colorA.r + (colorB.r - colorA.r) * t + noise);
      buffer[i + 1] = clamp(colorA.g + (colorB.g - colorA.g) * t + noise);
      buffer[i + 2] = clamp(colorA.b + (colorB.b - colorA.b) * t + noise);
    }
  }

  return buffer;
}

function clamp(value) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

async function generatePhotos() {
  const sizes = [
    [400, 300],
    [800, 600],
    [1024, 768],
    [1280, 800],
    [1600, 1200],
    [640, 480],
    [960, 640],
    [1200, 900],
    [500, 500],
    [720, 480],
    [900, 1200],
    [1440, 900],
    [640, 960],
    [1080, 1080],
    [1600, 900],
    [480, 640],
    [1024, 1024],
    [768, 1024],
  ];
  // Keep every file genuinely small: JPEGs get standard lossy compression,
  // PNGs are palette-quantized (few flat gradient bands compress very well
  // this way) so a 1600x1200 synthetic gradient still lands in the tens of
  // KB rather than megabytes.

  let count = 0;

  for (let i = 0; i < sizes.length; i++) {
    const [width, height] = sizes[i];
    const palette = randChoice(PALETTES);
    const [colorA, colorB] = [randChoice(palette), randChoice(palette)];
    const raw = gradientBuffer(width, height, colorA, colorB, `photo-${i}`);

    const image = sharp(raw, {
      raw: { width, height, channels: 3 },
    });

    const isJpeg = i % 2 === 0;
    const ext = isJpeg ? "jpg" : "png";
    const outPath = path.join(OUT_DIR, `photo-${i}-${width}x${height}.${ext}`);

    if (isJpeg) {
      await image.jpeg({ quality: 65, mozjpeg: true }).toFile(outPath);
    } else {
      await image
        .png({ compressionLevel: 9, palette: true, colors: 48, quality: 60 })
        .toFile(outPath);
    }

    count++;
  }

  return count;
}

async function generateGifs() {
  const gifSpecs = [
    { name: "anim-0-loader", width: 160, height: 120, frames: 6 },
    { name: "anim-1-banner", width: 320, height: 180, frames: 4 },
    { name: "anim-2-icon", width: 96, height: 96, frames: 8 },
    { name: "anim-3-strip", width: 240, height: 160, frames: 5 },
  ];

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "blot-bench-gif-"));
  let count = 0;

  let hasConvert = true;
  try {
    execFileSync("convert", ["-version"], { stdio: "ignore" });
  } catch (err) {
    hasConvert = false;
  }

  for (const spec of gifSpecs) {
    const framePaths = [];
    const palette = randChoice(PALETTES);

    for (let f = 0; f < spec.frames; f++) {
      const t = f / spec.frames;
      const colorA = randChoice(palette);
      const colorB = randChoice(palette);
      // Shift the gradient a bit per frame so the animation is visibly
      // different frame to frame.
      const raw = gradientBuffer(
        spec.width,
        spec.height,
        colorA,
        colorB,
        `${spec.name}-frame-${f}-${t}`
      );

      const framePath = path.join(tmpDir, `${spec.name}-frame-${f}.png`);
      await sharp(raw, { raw: { width: spec.width, height: spec.height, channels: 3 } })
        .png()
        .toFile(framePath);
      framePaths.push(framePath);
    }

    const outPath = path.join(OUT_DIR, `${spec.name}.gif`);

    if (hasConvert) {
      execFileSync("convert", [
        "-delay",
        "20",
        "-loop",
        "0",
        "-colors",
        "48",
        ...framePaths,
        "-layers",
        "Optimize",
        outPath,
      ]);
    } else {
      // Fallback: a valid (if static) GIF using sharp's own GIF encoder so
      // the pool still has a .gif entry when ImageMagick isn't available.
      await sharp(framePaths[0]).gif().toFile(outPath);
    }

    count++;
  }

  fs.rmSync(tmpDir, { recursive: true, force: true });

  return count;
}

function generateSvgs() {
  const svgs = [
    {
      name: "icon-star.svg",
      content: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <polygon points="32,4 40,24 62,24 44,38 51,60 32,47 13,60 20,38 2,24 24,24"
    fill="#f2c94c" stroke="#c9992f" stroke-width="2"/>
</svg>
`,
    },
    {
      name: "icon-badge.svg",
      content: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <circle cx="50" cy="50" r="46" fill="#2980b9"/>
  <circle cx="50" cy="50" r="30" fill="#ecf0f1"/>
  <text x="50" y="58" font-size="28" font-family="sans-serif" text-anchor="middle" fill="#2980b9">B</text>
</svg>
`,
    },
  ];

  for (const svg of svgs) {
    fs.writeFileSync(path.join(OUT_DIR, svg.name), svg.content);
  }

  return svgs.length;
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  // Clean out any previous run so regenerating is idempotent.
  for (const file of fs.readdirSync(OUT_DIR)) {
    fs.unlinkSync(path.join(OUT_DIR, file));
  }

  const photoCount = await generatePhotos();
  const gifCount = await generateGifs();
  const svgCount = generateSvgs();

  console.log(
    `Generated ${photoCount} photos, ${gifCount} gifs, ${svgCount} svgs ` +
      `into ${OUT_DIR}`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
