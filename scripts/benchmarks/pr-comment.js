#!/usr/bin/env node
"use strict";

// Post (or update) the sticky benchmark comment on a pull request.
//
//   node scripts/benchmarks/pr-comment.js \
//     --pr 1489 --arch amd64 \
//     --result .benchmarks/result-amd64.json \
//     --baseline .benchmarks/baseline-amd64.json
//
// Report-only: never fails CI. Requires the `gh` CLI with GH_TOKEN set and
// GITHUB_REPOSITORY in the environment (both provided by GitHub Actions).

const fs = require("fs");
const { spawnSync } = require("child_process");

const { compareToBaseline, markdownTable, hasRegression } = require("./lib/report");
const { loadHistory, computeBaseline } = require("./lib/history");
const { BENCHMARK_DEFAULTS } = require("../../app/blog/benchmarks/util/defaults");

function arg(name, fallback = null) {
  const i = process.argv.indexOf(name);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

function readJson(file) {
  if (!file || !fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (err) {
    console.warn(`[pr-comment] could not parse ${file}: ${err.message}`);
    return null;
  }
}

function gh(args, input) {
  const res = spawnSync("gh", args, {
    encoding: "utf8",
    input,
    env: process.env,
  });
  if (res.status !== 0) {
    throw new Error(`gh ${args.join(" ")} failed: ${res.stderr || res.stdout}`);
  }
  return res.stdout;
}

function buildBody({ arch, result, baseline, marker }) {
  const rows = compareToBaseline(result, baseline);
  const cfg = result.config || {};
  const runUrl =
    process.env.GITHUB_SERVER_URL &&
    process.env.GITHUB_REPOSITORY &&
    process.env.GITHUB_RUN_ID
      ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`
      : null;

  const lines = [];
  lines.push(`### 📊 Benchmark — \`${arch}\``);
  lines.push("");

  if (!baseline || !baseline.sample_count) {
    lines.push(
      "> No master baseline yet — showing this run's raw numbers. " +
        "Comparisons appear once master has accumulated enough samples."
    );
  } else if (baseline.sample_count < BENCHMARK_DEFAULTS.minBaselineSamples) {
    lines.push(
      `> Baseline still maturing (${baseline.sample_count}/${BENCHMARK_DEFAULTS.minBaselineSamples} samples). ` +
        "Deltas shown for information only."
    );
  } else if (hasRegression(rows)) {
    lines.push(
      "> 🔴 One or more metrics moved outside the noise band. GitHub-hosted " +
        "runners are noisy — treat this as a prompt to look, **not** a merge blocker."
    );
  } else {
    lines.push("> No metric moved outside the noise band.");
  }

  lines.push("");
  lines.push(markdownTable(rows));
  lines.push("");
  lines.push(
    "<sub>" +
      [
        `seed \`${cfg.seed}\``,
        `${cfg.sites} sites`,
        `${cfg.files} files`,
        `${result.iterations || 1} iteration(s)`,
        baseline && baseline.sample_count
          ? `baseline: median of ${baseline.sample_count}`
          : "baseline: none",
        runUrl ? `[run](${runUrl})` : null,
      ]
        .filter(Boolean)
        .join(" · ") +
      "</sub>"
  );
  lines.push("");
  lines.push(marker);

  return lines.join("\n");
}

function main() {
  const pr = arg("--pr");
  const arch = arg("--arch", "amd64");
  const resultFile = arg("--result");
  const baselineFile = arg("--baseline");
  const historyDir = arg("--history-dir");
  const repo = process.env.GITHUB_REPOSITORY;

  if (!pr || !resultFile || !repo) {
    console.error(
      "[pr-comment] need --pr, --result and $GITHUB_REPOSITORY; skipping"
    );
    return;
  }

  const result = readJson(resultFile);
  if (!result) {
    console.error(`[pr-comment] no usable result at ${resultFile}; skipping`);
    return;
  }

  let baseline = readJson(baselineFile);
  if (!baseline && historyDir) {
    const history = loadHistory(historyDir, arch);
    baseline = history.length ? computeBaseline(history) : null;
  }

  const marker = `<!-- blot-benchmark-comment:${arch} -->`;
  const body = buildBody({ arch, result, baseline, marker });

  try {
    const existing = JSON.parse(
      gh([
        "api",
        `repos/${repo}/issues/${pr}/comments`,
        "--paginate",
        "--jq",
        "[.[] | {id, body}]",
      ])
    );
    const match = existing.find((c) => (c.body || "").includes(marker));

    if (match) {
      gh(
        [
          "api",
          "--method",
          "PATCH",
          `repos/${repo}/issues/comments/${match.id}`,
          "-f",
          "body=@-",
        ],
        body
      );
      console.log(`[pr-comment] updated comment ${match.id}`);
    } else {
      gh(
        [
          "api",
          "--method",
          "POST",
          `repos/${repo}/issues/${pr}/comments`,
          "-f",
          "body=@-",
        ],
        body
      );
      console.log("[pr-comment] created comment");
    }
  } catch (err) {
    // Never fail the build over a comment.
    console.warn(`[pr-comment] ${err.message}`);
  }
}

main();
