"use strict";

const { BENCHMARK_DEFAULTS } = require("./defaults");

// Coerce to a finite number, otherwise fall back to the shared default.
function num(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function boundedInt(value, fallback, min, max) {
  const parsed = num(value, fallback);
  return Number.isInteger(parsed) && parsed >= min && parsed <= max
    ? parsed
    : fallback;
}

function parseBenchmarkConfig(raw = {}) {
  return {
    sites: num(raw.sites, BENCHMARK_DEFAULTS.sites),
    files: num(raw.files, BENCHMARK_DEFAULTS.files),
    largeEntryCount: boundedInt(
      raw.largeEntryCount,
      BENCHMARK_DEFAULTS.largeEntryCount,
      0,
      25
    ),
    largeEntryKilobytes: boundedInt(
      raw.largeEntryKilobytes,
      BENCHMARK_DEFAULTS.largeEntryKilobytes,
      64,
      2048
    ),
    imagesPerMediaEntry: boundedInt(
      raw.imagesPerMediaEntry,
      BENCHMARK_DEFAULTS.imagesPerMediaEntry,
      1,
      250
    ),
    seed: String(raw.seed || BENCHMARK_DEFAULTS.seed),
    renderConcurrency: num(
      raw.renderConcurrency,
      BENCHMARK_DEFAULTS.renderConcurrency
    ),
    writeConcurrency: num(
      raw.writeConcurrency,
      BENCHMARK_DEFAULTS.writeConcurrency
    ),
    cpuSampleIntervalMs: num(
      raw.cpuSampleIntervalMs,
      BENCHMARK_DEFAULTS.cpuSampleIntervalMs
    ),
    regressionThresholdPercent: num(
      raw.regressionThresholdPercent,
      BENCHMARK_DEFAULTS.regressionThresholdPercent
    ),
    requestsPerPage: num(
      raw.requestsPerPage,
      BENCHMARK_DEFAULTS.requestsPerPage
    ),
  };
}

module.exports = {
  parseBenchmarkConfig,
};
