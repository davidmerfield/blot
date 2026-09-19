// Deploy-time verification of a freshly started container. Run by the deploy
// script (scripts/deploy/index.js) via `docker exec` once the container
// reports healthy, for the first container of a deploy only - if it fails the
// deploy stops before the remaining containers are touched.
//
// Deliberately NOT part of /health or the Docker HEALTHCHECK: those run for
// the container's whole life, including crash-restarts, when the priority is
// to keep serving whatever we can. Every check here is critical - one failure
// fails the deploy.
//
// usage: node verify-container/index.js <expected BLOT_RELEASE_ID>

// The deploy script's ssh wrapper gives up after 60s, so keep each check well
// under that; a healthy check takes well under a second.
const CHECK_TIMEOUT = 10 * 1000;

function withTimeout(promise, ms, name) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`timed out after ${ms / 1000}s`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

// Runs every check (a failure doesn't stop the rest, so one run shows
// everything that's wrong) and returns { ok, report }.
async function runChecks(checks, context, timeout = CHECK_TIMEOUT) {
  const lines = [];
  let ok = true;

  for (const check of checks) {
    try {
      const detail = await withTimeout(
        Promise.resolve().then(() => check.run(context)),
        timeout,
        check.name
      );
      lines.push(`  PASS  ${check.name}: ${detail}`);
    } catch (err) {
      ok = false;
      lines.push(`  FAIL  ${check.name}: ${err.message}`);
    }
  }

  return { ok, report: lines.join("\n") };
}

async function main() {
  const config = require("config");
  const createRedisClient = require("models/redis");
  const checks = require("./checks");

  const redis = createRedisClient();
  let result;

  try {
    await withTimeout(redis.connect(), CHECK_TIMEOUT, "redis connect");
    result = await runChecks(checks, {
      config,
      redis,
      expectedRelease: process.argv[2],
    });
  } catch (err) {
    // Without redis most checks can't say anything useful; report just this.
    result = { ok: false, report: `  FAIL  redis connect: ${err.message}` };
  } finally {
    if (redis.isOpen) await redis.quit().catch(() => {});
  }

  // Failures go to stderr so they end up in the deploy script's error message.
  (result.ok ? console.log : console.error)(result.report);
  process.exit(result.ok ? 0 : 1);
}

if (require.main === module) main();

module.exports = { runChecks };
