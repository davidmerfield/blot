#!/usr/bin/env node

var Jasmine = require("jasmine");
var colors = require("colors");
var fs = require("fs-extra");
var path = require("path");
var seedrandom = require("seedrandom");

var args = parseArgs(process.argv.slice(2));
var client = require("models/client");
var registerGlobalTest = require("../tests/register-global-test");
var clfdate;

try {
  clfdate = require("helper/clfdate");
} catch (err) {
  clfdate = function () {
    return new Date().toISOString();
  };
}

var jasmine = new Jasmine();

var jasmineConfig = {
  spec_dir: "",
  spec_files: [
    "**/benchmarks/benchmarks.js",
    "!**/node_modules/**",
  ],
  helpers: [],
  stopSpecOnExpectationFailure: true,
  random: false,
};

if (args.path) {
  console.log(clfdate(), "Running benchmarks in", colors.cyan(args.path));

  if (args.path.endsWith(".js")) {
    jasmineConfig.spec_files = [args.path];
  } else {
    jasmineConfig.spec_dir = args.path;
  }
}

var benchmarkConfig = {
  sites: args.sites,
  files: args.files,
  seed: args.seed,
  renderConcurrency: args.renderConcurrency,
  cpuSampleIntervalMs: args.cpuSampleIntervalMs,
  regressionThresholdPercent: args.regressionThresholdPercent,
};

global.__BLOT_BENCHMARK_CONFIG = benchmarkConfig;

seedrandom(benchmarkConfig.seed, { global: true });
jasmine.seed(benchmarkConfig.seed);
jasmine.loadConfig(jasmineConfig);

registerGlobalTest();

console.log(clfdate(), "Benchmark config:", benchmarkConfig);

jasmine.addReporter({
  jasmineDone: function (result) {
    var benchmarkResult = global.__BLOT_BENCHMARK_RESULT || null;
    var exitCode = result.overallStatus === "passed" ? 0 : 1;

    if (result.overallStatus === "passed" && !benchmarkResult) {
      console.error("[benchmark] Missing benchmark result payload from spec run");
      exitCode = 1;
    }

    if (benchmarkResult) {
      applyBaselineGate(benchmarkResult, args);

      if (args.output) {
        fs.ensureDirSync(path.dirname(args.output));
        fs.writeJsonSync(args.output, benchmarkResult, { spaces: 2 });
        console.log(clfdate(), "Wrote benchmark result", colors.cyan(args.output));
      }

      if (args.ci && benchmarkResult.status === "fail") {
        exitCode = 1;
      }

      if (benchmarkResult.status === "collecting-baseline") {
        console.log(
          clfdate(),
          colors.yellow(
            `Collecting baseline samples (${benchmarkResult.gate.sample_count}/${benchmarkResult.gate.required_samples})`
          )
        );
      }
    }

    process.exitCode = exitCode;

    setImmediate(function () {
      process.exit(process.exitCode);
    });
  },
});

client.keys("*", function (err, keys) {
  if (err) {
    throw err;
  }

  if (keys.length > 0) {
    throw new Error("Database is not empty: " + keys.length + " keys found");
  }

  jasmine.execute();
});

function applyBaselineGate(result, cliArgs) {
  if (!cliArgs.ci) {
    result.status = result.status || "pass";
    return;
  }

  var baseline = loadBaseline(cliArgs.baselineFile);
  if (!baseline || !Number.isFinite(baseline.sample_count)) {
    result.status = "collecting-baseline";
    result.gate = {
      sample_count: 0,
      required_samples: cliArgs.minBaselineSamples,
      threshold_percent: cliArgs.regressionThresholdPercent,
      reason: "baseline-unavailable",
    };
    return;
  }

  if (baseline.sample_count < cliArgs.minBaselineSamples) {
    result.status = "collecting-baseline";
    result.gate = {
      sample_count: baseline.sample_count,
      required_samples: cliArgs.minBaselineSamples,
      threshold_percent: cliArgs.regressionThresholdPercent,
      reason: "baseline-not-mature",
    };
    return;
  }

  var buildBaseline = Number(baseline.build_p50_median_ms);
  var renderBaseline = Number(baseline.render_p50_median_ms);

  if (!Number.isFinite(buildBaseline) || !Number.isFinite(renderBaseline)) {
    result.status = "collecting-baseline";
    result.gate = {
      sample_count: baseline.sample_count,
      required_samples: cliArgs.minBaselineSamples,
      threshold_percent: cliArgs.regressionThresholdPercent,
      reason: "baseline-metrics-invalid",
    };
    return;
  }

  var buildCurrent = Number(result.build && result.build.timing_ms && result.build.timing_ms.p50);
  var renderCurrent = Number(result.render && result.render.timing_ms && result.render.timing_ms.p50);

  var buildRegressionPercent = ((buildCurrent - buildBaseline) / buildBaseline) * 100;
  var renderRegressionPercent = ((renderCurrent - renderBaseline) / renderBaseline) * 100;

  var failedMetrics = [];

  if (buildRegressionPercent > cliArgs.regressionThresholdPercent) {
    failedMetrics.push("build.p50");
  }

  if (renderRegressionPercent > cliArgs.regressionThresholdPercent) {
    failedMetrics.push("render.p50");
  }

  result.gate = {
    sample_count: baseline.sample_count,
    required_samples: cliArgs.minBaselineSamples,
    threshold_percent: cliArgs.regressionThresholdPercent,
    baseline: {
      build_p50_median_ms: buildBaseline,
      render_p50_median_ms: renderBaseline,
    },
    candidate: {
      build_p50_ms: buildCurrent,
      render_p50_ms: renderCurrent,
    },
    regressions_percent: {
      build_p50: buildRegressionPercent,
      render_p50: renderRegressionPercent,
    },
    failed_metrics: failedMetrics,
  };

  if (failedMetrics.length) {
    result.status = "fail";
    console.error(
      clfdate(),
      colors.red(
        `Benchmark regression detected (${failedMetrics.join(", ")}) with threshold ${cliArgs.regressionThresholdPercent}%`
      )
    );
    return;
  }

  result.status = "pass";
}

function loadBaseline(filePath) {
  if (!filePath) {
    return null;
  }

  if (!fs.existsSync(filePath)) {
    return null;
  }

  try {
    return fs.readJsonSync(filePath);
  } catch (err) {
    console.error(clfdate(), "Failed to parse baseline file", err.message);
    return null;
  }
}

function parseArgs(argv) {
  var parsed = {
    sites: 5,
    files: 1000,
    seed: "blot-benchmark-seed",
    renderConcurrency: 8,
    cpuSampleIntervalMs: 250,
    regressionThresholdPercent: 10,
    minBaselineSamples: 10,
    output: null,
    baselineFile: null,
    path: null,
    ci: false,
  };

  var positional = [];

  for (var i = 0; i < argv.length; i++) {
    var arg = argv[i];
    var next = argv[i + 1];

    if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }

    if (arg === "--ci") {
      parsed.ci = true;
      continue;
    }

    if (arg === "--sites" && next) {
      parsed.sites = Number(next);
      i += 1;
      continue;
    }

    if (arg === "--files" && next) {
      parsed.files = Number(next);
      i += 1;
      continue;
    }

    if (arg === "--seed" && next) {
      parsed.seed = String(next);
      i += 1;
      continue;
    }

    if (arg === "--render-concurrency" && next) {
      parsed.renderConcurrency = Number(next);
      i += 1;
      continue;
    }

    if (arg === "--output" && next) {
      parsed.output = next;
      i += 1;
      continue;
    }

    if (arg === "--baseline-file" && next) {
      parsed.baselineFile = next;
      i += 1;
      continue;
    }

    if (arg === "--regression-threshold" && next) {
      parsed.regressionThresholdPercent = Number(next);
      i += 1;
      continue;
    }

    if (arg === "--min-baseline-samples" && next) {
      parsed.minBaselineSamples = Number(next);
      i += 1;
      continue;
    }

    if (arg === "--cpu-sample-interval-ms" && next) {
      parsed.cpuSampleIntervalMs = Number(next);
      i += 1;
      continue;
    }

    if (arg === "--path" && next) {
      parsed.path = next;
      i += 1;
      continue;
    }

    if (arg.startsWith("--")) {
      throw new Error("Unknown argument: " + arg);
    }

    positional.push(arg);
  }

  if (!parsed.path && positional.length) {
    parsed.path = positional[0];
  }

  if (parsed.output) {
    parsed.output = path.resolve(parsed.output);
  }

  if (parsed.baselineFile) {
    parsed.baselineFile = path.resolve(parsed.baselineFile);
  }

  ensurePositiveInt(parsed.sites, "--sites");
  ensurePositiveInt(parsed.files, "--files");
  ensurePositiveInt(parsed.renderConcurrency, "--render-concurrency");
  ensurePositiveInt(parsed.cpuSampleIntervalMs, "--cpu-sample-interval-ms");
  ensurePositiveInt(parsed.minBaselineSamples, "--min-baseline-samples");

  if (!Number.isFinite(parsed.regressionThresholdPercent) || parsed.regressionThresholdPercent < 0) {
    throw new Error("--regression-threshold must be >= 0");
  }

  return parsed;
}

function ensurePositiveInt(value, name) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(name + " must be a positive integer");
  }
}

function printHelp() {
  console.log(`Usage: node scripts/benchmarks [options]\n\nOptions:\n  --sites <n>                    Number of benchmark sites (default: 5)\n  --files <n>                    Total generated files (default: 1000)\n  --seed <value>                 Deterministic seed (default: blot-benchmark-seed)\n  --render-concurrency <n>       Concurrency for sitemap page rendering (default: 8)\n  --cpu-sample-interval-ms <ms>  CPU/memory sampling interval (default: 250)\n  --output <path>                Write JSON benchmark result to path\n  --ci                           Enable CI gate behavior\n  --baseline-file <path>         Baseline JSON file for CI comparison\n  --regression-threshold <n>     Regression threshold percent (default: 10)\n  --min-baseline-samples <n>     Required baseline samples before gating (default: 10)\n  --path <path>                  Limit benchmark discovery to path\n  --help                         Show this help message\n`);
}
