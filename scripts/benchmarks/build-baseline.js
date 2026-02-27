#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const args = parseArgs(process.argv.slice(2));

const files = collectJsonFiles(args.inputDir);
const samples = [];

for (const file of files) {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    const buildP50 = Number(parsed?.build?.timing_ms?.p50);
    const renderP50 = Number(parsed?.render?.timing_ms?.p50);

    if (Number.isFinite(buildP50) && Number.isFinite(renderP50)) {
      samples.push({ file, buildP50, renderP50 });
    }
  } catch (err) {
    console.warn(`[build-baseline] skipping ${file}: ${err.message}`);
  }
}

const baseline = {
  schema_version: 1,
  generated_at: new Date().toISOString(),
  sample_count: samples.length,
  min_samples_required: args.minSamples,
  build_p50_median_ms: median(samples.map((sample) => sample.buildP50)),
  render_p50_median_ms: median(samples.map((sample) => sample.renderP50)),
  source_files: samples.map((sample) => path.basename(sample.file)),
};

fs.mkdirSync(path.dirname(args.output), { recursive: true });
fs.writeFileSync(args.output, JSON.stringify(baseline, null, 2));

console.log(`[build-baseline] wrote ${args.output}`);
console.log(`[build-baseline] sample_count=${baseline.sample_count}`);
console.log(
  `[build-baseline] build_p50_median_ms=${baseline.build_p50_median_ms}, render_p50_median_ms=${baseline.render_p50_median_ms}`
);

function parseArgs(argv) {
  const parsed = {
    inputDir: null,
    output: null,
    minSamples: 10,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = argv[i + 1];

    if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }

    if (arg === "--input-dir" && next) {
      parsed.inputDir = path.resolve(next);
      i += 1;
      continue;
    }

    if (arg === "--output" && next) {
      parsed.output = path.resolve(next);
      i += 1;
      continue;
    }

    if (arg === "--min-samples" && next) {
      parsed.minSamples = Number(next);
      i += 1;
      continue;
    }

    throw new Error(`Unknown or incomplete argument: ${arg}`);
  }

  if (!parsed.inputDir) {
    throw new Error("--input-dir is required");
  }

  if (!parsed.output) {
    throw new Error("--output is required");
  }

  if (!Number.isInteger(parsed.minSamples) || parsed.minSamples <= 0) {
    throw new Error("--min-samples must be a positive integer");
  }

  return parsed;
}

function collectJsonFiles(directory) {
  if (!fs.existsSync(directory)) {
    return [];
  }

  const files = [];

  for (const entry of fs.readdirSync(directory)) {
    const full = path.join(directory, entry);
    const stat = fs.statSync(full);

    if (stat.isDirectory()) {
      files.push(...collectJsonFiles(full));
      continue;
    }

    if (entry.endsWith(".json")) {
      files.push(full);
    }
  }

  return files;
}

function median(values) {
  const sorted = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);

  if (!sorted.length) {
    return null;
  }

  const middle = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 0) {
    return (sorted[middle - 1] + sorted[middle]) / 2;
  }

  return sorted[middle];
}

function printHelp() {
  console.log(`Usage: node scripts/benchmarks/build-baseline.js --input-dir <dir> --output <file> [--min-samples <n>]`);
}
