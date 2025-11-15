// docker exec -it blot-node-app-1 node scripts/db/migrate-rendered-output-to-disk.js
// Migrates rendered CDN output from Redis to disk storage
// 
// This script:
// 1. Iterates over all templates using each/template
// 2. Inspects the cdn object in each template's metadata to identify hashes
// 3. For each hash found, migrates it from Redis to disk (with extension from view name)
// 4. If a template had hashes migrated, flushes the cache for the blog that owns it
//
// This approach is safer than migrating all Redis keys because:
// - It only migrates hashes that are actively referenced in manifests
// - It flushes cache for affected blogs, triggering a rebuild that will generate new URLs
// - It doesn't delete Redis keys that might still be needed by legacy URLs

const eachTemplate = require("../each/template");
const getMetadata = require("models/template/getMetadata");
const Blog = require("models/blog");
const client = require("models/client");
const key = require("models/template/key");
const { promisify } = require("util");
const fs = require("fs-extra");
const path = require("path");
const config = require("config");

// Base directory for rendered output storage
const RENDERED_OUTPUT_BASE_DIR = path.join(config.data_directory, "cdn", "template");

const getMetadataAsync = promisify(getMetadata);
const getAsync = promisify(client.get).bind(client);
const delAsync = promisify(client.del).bind(client);
const blogSetAsync = promisify(Blog.set);

function getRenderedOutputPath(hash, ext = "") {
  if (!hash || typeof hash !== "string" || hash.length < 4) {
    throw new Error("Invalid hash: must be a string with at least 4 characters");
  }
  const dir1 = hash.substring(0, 2);
  const dir2 = hash.substring(2, 4);
  return path.join(RENDERED_OUTPUT_BASE_DIR, dir1, dir2, hash + ext);
}

async function writeRenderedOutputToDisk(hash, content, ext = "") {
  const filePath = getRenderedOutputPath(hash, ext);
  await fs.ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, content, "utf8");
}

async function readRenderedOutputFromDisk(hash, ext = "") {
  const filePath = getRenderedOutputPath(hash, ext);
  return await fs.readFile(filePath, "utf8");
}

async function migrateHash(hash, ext) {
  // Validate hash format (should be 32 hex characters)
  if (!/^[a-f0-9]{32}$/.test(hash)) {
    return false;
  }

  const redisKey = key.renderedOutput(hash);
  const filePath = getRenderedOutputPath(hash, ext);

  // Check if already on disk with correct extension
  if (await fs.pathExists(filePath)) {
    // Verify content matches
    const diskContent = await fs.readFile(filePath, "utf8");
    const redisContent = await getAsync(redisKey);

    if (diskContent === redisContent) {
      // Content matches, safe to delete from Redis
      await delAsync(redisKey);
      return false; // Already migrated, just cleaned up Redis
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
    return false; // Not in Redis, skip
  }

  // Write to disk with extension
  await writeRenderedOutputToDisk(hash, content, ext);

  // Verify write
  const verifyContent = await readRenderedOutputFromDisk(hash, ext);
  if (verifyContent !== content) {
    throw new Error("Content mismatch after write");
  }

  // Delete from Redis
  await delAsync(redisKey);

  return true; // Successfully migrated
}

async function migrate() {
  console.log("Starting migration of rendered output from Redis to disk...");
  console.log("Iterating over all templates to find referenced hashes...\n");

  let totalTemplates = 0;
  let templatesWithHashes = 0;
  let totalHashes = 0;
  let migratedHashes = 0;
  let skippedHashes = 0;
  let failedHashes = 0;
  let blogsFlushed = 0;
  let errors = [];

  await new Promise((resolve, reject) => {
    eachTemplate(
      async function (user, blog, template, nextTemplate) {
        totalTemplates++;

        try {
          // Get template metadata to access cdn object
          const metadata = await getMetadataAsync(template.id);
          if (!metadata || !metadata.cdn || typeof metadata.cdn !== "object") {
            return nextTemplate();
          }

          const cdn = metadata.cdn;
          const hashes = Object.keys(cdn);
          
          if (hashes.length === 0) {
            return nextTemplate();
          }

          templatesWithHashes++;
          totalHashes += hashes.length;
          let templateMigrated = false;

          // Migrate each hash found in the cdn object
          for (const viewName of hashes) {
            const hash = cdn[viewName];
            if (!hash || typeof hash !== "string") {
              continue;
            }

            // Extract extension from view name
            const ext = path.extname(viewName) || "";

            try {
              const wasMigrated = await migrateHash(hash, ext);
              if (wasMigrated) {
                migratedHashes++;
                templateMigrated = true;
              } else {
                skippedHashes++;
              }
            } catch (err) {
              console.error(
                `Failed to migrate hash ${hash} for view ${viewName} in template ${template.id}:`,
                err.message
              );
              failedHashes++;
              errors.push({
                template: template.id,
                view: viewName,
                hash: hash,
                error: err.message,
              });
            }
          }

          // If any hashes were migrated for this template, update blog cacheID to invalidate cache
          if (templateMigrated) {
            try {
              await blogSetAsync(blog.id, { cacheID: Date.now() });
              blogsFlushed++;
              console.log(
                `Migrated hashes for template ${template.id} (${blog.handle || blog.id}), updated cacheID`
              );
            } catch (err) {
              console.error(
                `Failed to update cacheID for blog ${blog.id}:`,
                err.message
              );
              errors.push({
                template: template.id,
                blog: blog.id,
                error: `Failed to update cacheID: ${err.message}`,
              });
            }
          }

          if (totalTemplates % 100 === 0) {
            console.log(
              `Progress: ${totalTemplates} templates processed, ${migratedHashes} hashes migrated...`
            );
          }

          nextTemplate();
        } catch (err) {
          console.error(
            `Error processing template ${template.id}:`,
            err.message
          );
          errors.push({
            template: template.id,
            error: err.message,
          });
          nextTemplate();
        }
      },
      function (err) {
        if (err) return reject(err);
        resolve();
      }
    );
  });

  console.log("\n" + "=".repeat(60));
  console.log("Migration complete:");
  console.log(`  Total templates processed: ${totalTemplates}`);
  console.log(`  Templates with CDN hashes: ${templatesWithHashes}`);
  console.log(`  Total hashes found: ${totalHashes}`);
  console.log(`  Hashes migrated: ${migratedHashes}`);
  console.log(`  Hashes skipped: ${skippedHashes}`);
  console.log(`  Hashes failed: ${failedHashes}`);
  console.log(`  Blogs cacheID updated: ${blogsFlushed}`);

  if (errors.length > 0) {
    console.log("\nErrors:");
    errors.slice(0, 10).forEach((error) => {
      console.log(`  ${JSON.stringify(error)}`);
    });
    if (errors.length > 10) {
      console.log(`  ... and ${errors.length - 10} more errors`);
    }
  }

  if (failedHashes > 0) {
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
