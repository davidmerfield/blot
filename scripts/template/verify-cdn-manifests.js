const { promisify } = require("util");
const eachTemplate = require("../each/template");
const updateCdnManifest = promisify(
  require("models/template/util/updateCdnManifest")
);

let processedCount = 0;
let changedCount = 0;

function normalizeManifest(manifest) {
  if (!manifest || typeof manifest !== "object") return {};

  return Object.keys(manifest)
    .sort()
    .reduce((acc, key) => {
      acc[key] = manifest[key];
      return acc;
    }, {});
}

function stringifyManifest(manifest) {
  return JSON.stringify(normalizeManifest(manifest));
}

function describeChanges(oldManifest, newManifest) {
  const oldKeys = new Set(Object.keys(oldManifest));
  const newKeys = new Set(Object.keys(newManifest));
  const added = [];
  const removed = [];
  const modified = [];

  newKeys.forEach((key) => {
    if (!oldKeys.has(key)) {
      added.push(key);
    } else if (oldManifest[key] !== newManifest[key]) {
      modified.push(key);
    }
  });

  oldKeys.forEach((key) => {
    if (!newKeys.has(key)) {
      removed.push(key);
    }
  });

  const messages = [];

  if (added.length) {
    messages.push(
      `Added: ${added.map((key) => `${key} -> ${newManifest[key]}`).join(", ")}`
    );
  }

  if (removed.length) {
    messages.push(
      `Removed: ${removed
        .map((key) => `${key} -> ${oldManifest[key]}`)
        .join(", ")}`
    );
  }

  if (modified.length) {
    messages.push(
      `Modified: ${modified
        .map((key) => `${key} ${oldManifest[key]} -> ${newManifest[key]}`)
        .join(", ")}`
    );
  }

  if (!messages.length) messages.push("Manifest content changed.");

  return messages;
}

async function processTemplate(user, blog, template, next) {
  processedCount += 1;

  const existingManifest =
    template.cdn || (template.metadata && template.metadata.cdn) || {};
  const existingString = stringifyManifest(existingManifest);

  try {
    const updatedManifest = (await updateCdnManifest(template.id)) || {};
    const updatedString = stringifyManifest(updatedManifest);

    if (existingString !== updatedString) {
      changedCount += 1;
      const changes = describeChanges(existingManifest, updatedManifest);

      console.log(`Template ${template.id} CDN manifest changed:`);
      changes.forEach((message) => {
        console.log(`  - ${message}`);
      });
    }
  } catch (err) {
    console.error(`Error verifying CDN manifest for template ${template.id}:`, err);
  }

  next();
}

function main() {
  console.log("Starting CDN manifest verification for templates...");

  eachTemplate(processTemplate, function (err) {
    if (err) {
      console.error("Completed with errors:", err);
    }

    console.log("\nSummary:");
    console.log(`Templates processed: ${processedCount}`);
    console.log(`Templates with changes: ${changedCount}`);

    process.exit(0);
  });
}

if (require.main === module) {
  main();
}

module.exports = main;
