// docker exec -it blot-node-app-1 node scripts/db/migrate-rendered-output-to-disk.js
// Migrates rendered CDN output from Redis to disk storage
// 
// NOTE: This script is for migrating old files. New files are automatically written
// to disk with extensions when templates are updated. Old files without extensions
// will continue to be served from Redis via the legacy route until templates are
// regenerated, at which point they'll be written with extensions.
//
// This script:
// 1. Finds all keys matching "cdn:rendered:*"
// 2. Reads content from Redis
// 3. Writes to disk (with subdirectory structure, but WITHOUT extension - old format)
// 4. Verifies the write
// 5. Deletes from Redis

const redisKeys = require("../util/redisKeys");
const client = require("models/client");
const { promisify } = require("util");
const fs = require("fs-extra");
const path = require("path");
const config = require("config");

// Base directory for rendered output storage
const RENDERED_OUTPUT_BASE_DIR = path.join(config.data_directory, "cdn", "template");

/**
 * Get the file path for a rendered output hash
 * Uses subdirectories to avoid too many files in one directory
 * Format: {BASE_DIR}/{hash[0:2]}/{hash[2:4]}/{hash}{ext}
 * @param {string} hash - The 32-character hash
 * @param {string} ext - The file extension (e.g., ".css", ".js")
 * @returns {string} The file path
 */
function getRenderedOutputPath(hash, ext = "") {
  if (!hash || typeof hash !== "string" || hash.length < 4) {
    throw new Error("Invalid hash: must be a string with at least 4 characters");
  }
  const dir1 = hash.substring(0, 2);
  const dir2 = hash.substring(2, 4);
  return path.join(RENDERED_OUTPUT_BASE_DIR, dir1, dir2, hash + ext);
}

/**
 * Write rendered output to disk
 * @param {string} hash - The 32-character hash
 * @param {string} content - The content to write
 * @param {string} ext - The file extension (e.g., ".css", ".js")
 * @returns {Promise<void>}
 */
async function writeRenderedOutputToDisk(hash, content, ext = "") {
  const filePath = getRenderedOutputPath(hash, ext);
  await fs.ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, content, "utf8");
}

/**
 * Read rendered output from disk
 * @param {string} hash - The 32-character hash
 * @param {string} ext - The file extension (e.g., ".css", ".js")
 * @returns {Promise<string>} The file content
 * @throws {Error} If file doesn't exist or can't be read
 */
async function readRenderedOutputFromDisk(hash, ext = "") {
  const filePath = getRenderedOutputPath(hash, ext);
  return await fs.readFile(filePath, "utf8");
}

const getAsync = promisify(client.get).bind(client);
const delAsync = promisify(client.del).bind(client);

async function migrate() {
  console.log("Starting migration of rendered output from Redis to disk...");
  console.log("Pattern: cdn:rendered:*\n");

  let total = 0;
  let migrated = 0;
  let failed = 0;
  let skipped = 0;
  let errors = [];

  await redisKeys("cdn:rendered:*", async (redisKey) => {
    total++;

    try {
      // Extract hash from key (format: "cdn:rendered:{hash}")
      const hash = redisKey.replace("cdn:rendered:", "");

      // Validate hash format (should be 32 hex characters)
      if (!/^[a-f0-9]{32}$/.test(hash)) {
        console.log(`Skipping ${redisKey} (invalid hash format)`);
        skipped++;
        return;
      }

      // Check if already on disk (without extension - old format)
      // Note: New files are written with extensions, so we check the old format here
      const filePath = getRenderedOutputPath(hash, ""); // No extension for old format
      if (await fs.pathExists(filePath)) {
        // Verify content matches
        const diskContent = await fs.readFile(filePath, "utf8");
        const redisContent = await getAsync(redisKey);

        if (diskContent === redisContent) {
          // Content matches, safe to delete from Redis
          console.log(`Skipping ${hash} (already on disk and matches)`);
          await delAsync(redisKey);
          skipped++;
          return;
        } else {
          // Content differs, log warning but proceed with migration
          console.warn(
            `Warning: ${hash} exists on disk but content differs, overwriting...`
          );
        }
      }

      // Get from Redis
      const content = await getAsync(redisKey);
      if (!content) {
        console.log(`Skipping ${hash} (empty in Redis)`);
        skipped++;
        return;
      }

      // Write to disk (without extension - old format)
      // New files will be written with extensions when templates are regenerated
      await writeRenderedOutputToDisk(hash, content, ""); // No extension for old format

      // Verify write
      const verifyContent = await readRenderedOutputFromDisk(hash, ""); // No extension for old format
      if (verifyContent !== content) {
        throw new Error("Content mismatch after write");
      }

      // Delete from Redis
      await delAsync(redisKey);

      migrated++;
      if (migrated % 100 === 0) {
        console.log(`Progress: ${migrated} migrated, ${skipped} skipped, ${failed} failed...`);
      }
    } catch (err) {
      console.error(`Failed to migrate ${redisKey}:`, err.message);
      failed++;
      errors.push({ key: redisKey, error: err.message });
    }
  });

  console.log("\n" + "=".repeat(60));
  console.log("Migration complete:");
  console.log(`  Total keys found: ${total}`);
  console.log(`  Migrated: ${migrated}`);
  console.log(`  Skipped: ${skipped}`);
  console.log(`  Failed: ${failed}`);

  if (errors.length > 0) {
    console.log("\nErrors:");
    errors.slice(0, 10).forEach(({ key, error }) => {
      console.log(`  ${key}: ${error}`);
    });
    if (errors.length > 10) {
      console.log(`  ... and ${errors.length - 10} more errors`);
    }
  }

  if (failed > 0) {
    console.log("\n⚠️  Some migrations failed. Review errors above.");
    return 1;
  }

  console.log("\n✅ Migration completed successfully!");
  return 0;
}

if (require.main === module) {
  migrate()
    .then((exitCode) => {
      process.exit(exitCode);
    })
    .catch((err) => {
      console.error("Migration failed:", err);
      process.exit(1);
    });
}

module.exports = migrate;

