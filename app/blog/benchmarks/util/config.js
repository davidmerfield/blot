"use strict";

const { BENCHMARK_DEFAULTS } = require("./defaults");

// Coerce to a finite number, otherwise fall back to the shared default.
function num(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseBenchmarkConfig(raw = {}) {
  const templateProfile = String(
    raw.templateProfile || BENCHMARK_DEFAULTS.templateProfile,
  );

  if (!["default", "maximal"].includes(templateProfile)) {
    throw new Error(
      `templateProfile must be one of: default, maximal (got ${templateProfile})`,
    );
  }

  return {
    sites: num(raw.sites, BENCHMARK_DEFAULTS.sites),
    files: num(raw.files, BENCHMARK_DEFAULTS.files),
    seed: String(raw.seed || BENCHMARK_DEFAULTS.seed),
    templateProfile,
    renderConcurrency: num(
      raw.renderConcurrency,
      BENCHMARK_DEFAULTS.renderConcurrency,
    ),
    writeConcurrency: num(
      raw.writeConcurrency,
      BENCHMARK_DEFAULTS.writeConcurrency,
    ),
    cpuSampleIntervalMs: num(
      raw.cpuSampleIntervalMs,
      BENCHMARK_DEFAULTS.cpuSampleIntervalMs,
    ),
    regressionThresholdPercent: num(
      raw.regressionThresholdPercent,
      BENCHMARK_DEFAULTS.regressionThresholdPercent,
    ),
    requestsPerPage: num(
      raw.requestsPerPage,
      BENCHMARK_DEFAULTS.requestsPerPage,
    ),
  };
}

module.exports = {
  parseBenchmarkConfig,
};
