#!/usr/bin/env node
"use strict";

// Best-effort: make sure --out-dir has redis-dump.rdb/blogs.tar.gz/
// static.tar.gz/manifest.json. The GitHub Actions cache (benchmark-corpus-v*)
// is the primary store; if it missed entirely (first run ever, or 7+ idle
// days evicted it), fall back to the newest `benchmark-corpus-artifacts`
// artifact from a successful benchmarks-corpus.yml run.
//
//   node scripts/benchmarks/seed-corpus.js --out-dir .benchmarks/corpus
//
// Mirrors seed-history.js's shape. Never fails the caller: if nothing can be
// recovered, this just logs and leaves --out-dir empty - the caller
// (benchmarks-render.yml) is expected to treat a missing corpus as "skip /
// fall back", not crash.

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const REQUIRED_FILES = [
  "redis-dump.rdb",
  "blogs.tar.gz",
  "static.tar.gz",
  "manifest.json",
];

function arg(name, fallback = null) {
  const i = process.argv.indexOf(name);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

function gh(args, opts = {}) {
  return spawnSync("gh", args, { encoding: "utf8", env: process.env, ...opts });
}

function hasAllArtifacts(dir) {
  return REQUIRED_FILES.every((name) => {
    const p = path.join(dir, name);
    return fs.existsSync(p) && fs.statSync(p).size > 0;
  });
}

function main() {
  const outDir = arg("--out-dir", ".benchmarks/corpus");
  const workflow = arg("--workflow", "benchmarks-corpus.yml");
  const artifactName = arg("--artifact-name", "benchmark-corpus-artifacts");
  const repo = process.env.GITHUB_REPOSITORY;

  fs.mkdirSync(outDir, { recursive: true });

  if (hasAllArtifacts(outDir)) {
    console.log("[seed-corpus] cache hit; nothing to do.");
    return;
  }

  if (!repo || !process.env.GH_TOKEN) {
    console.log("[seed-corpus] no repo/token context; corpus stays missing.");
    return;
  }

  try {
    const runs = JSON.parse(
      gh([
        "api",
        `repos/${repo}/actions/workflows/${workflow}/runs?status=success&per_page=10`,
        "--jq",
        "[.workflow_runs[] | .databaseId // .id]",
      ]).stdout || "[]"
    );

    for (const runId of runs) {
      const artifactId = (
        gh([
          "api",
          `repos/${repo}/actions/runs/${runId}/artifacts`,
          "--jq",
          `.artifacts[] | select(.name=="${artifactName}") | .id`,
        ]).stdout || ""
      )
        .trim()
        .split("\n")[0];

      if (!artifactId) continue;

      const tmpZip = path.join(outDir, "_seed-corpus.zip");
      const dl = gh(
        ["api", `repos/${repo}/actions/artifacts/${artifactId}/zip`],
        { encoding: "buffer" }
      );

      if (dl.status !== 0 || !dl.stdout || !dl.stdout.length) continue;
      fs.writeFileSync(tmpZip, dl.stdout);

      const unzip = spawnSync("unzip", ["-o", tmpZip, "-d", outDir], {
        encoding: "utf8",
      });
      fs.rmSync(tmpZip, { force: true });

      if (unzip.status === 0 && hasAllArtifacts(outDir)) {
        console.log(`[seed-corpus] recovered corpus artifacts from run ${runId}.`);
        return;
      }
    }

    console.log("[seed-corpus] no recoverable artifact; corpus stays missing.");
  } catch (err) {
    console.warn(`[seed-corpus] ${err.message}; corpus stays missing.`);
  }
}

main();
