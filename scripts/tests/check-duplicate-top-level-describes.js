#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const target = process.argv[2];

if (!target) {
  console.error('Usage: node scripts/tests/check-duplicate-top-level-describes.js <test-suite-path>');
  process.exit(1);
}

const root = path.resolve(process.cwd(), target);

if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
  console.error(`Test suite path does not exist or is not a directory: ${target}`);
  process.exit(1);
}

const describePattern = /^describe\((['"`])([^'"`]+)\1/;
const jsFilePattern = /(?:^|\/)tests(?:\/.*\.js|\.js)$/;

function walk(dir, out) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      walk(fullPath, out);
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    const rel = path.relative(process.cwd(), fullPath).replace(/\\/g, '/');

    if (jsFilePattern.test(rel)) {
      out.push(rel);
    }
  }
}

const files = [];
walk(root, files);

const seen = new Map();
const duplicates = new Map();

for (const file of files.sort()) {
  const content = fs.readFileSync(file, 'utf8');
  const lines = content.split(/\r?\n/);

  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(describePattern);

    if (!match) {
      continue;
    }

    const name = match[2];
    const location = `${file}:${i + 1}`;

    if (seen.has(name)) {
      if (!duplicates.has(name)) {
        duplicates.set(name, [seen.get(name)]);
      }

      duplicates.get(name).push(location);
    } else {
      seen.set(name, location);
    }

    break;
  }
}

if (duplicates.size > 0) {
  console.error(`Duplicate top-level describe() names found in shard '${target}':`);

  for (const [name, locations] of [...duplicates.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    console.error(`- ${name}`);
    for (const location of locations) {
      console.error(`  - ${location}`);
    }
  }

  process.exit(1);
}

console.log(`No duplicate top-level describe() names found in shard '${target}'.`);
