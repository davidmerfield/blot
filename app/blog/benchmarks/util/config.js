function parseBenchmarkConfig(raw = {}) {
  return {
    sites: Number(raw.sites) || 5,
    files: Number(raw.files) || 2000,
    seed: String(raw.seed || "blot-benchmark-seed"),
    renderConcurrency: Number(raw.renderConcurrency) || 8,
    cpuSampleIntervalMs: Number(raw.cpuSampleIntervalMs) || 250,
    regressionThresholdPercent: Number(raw.regressionThresholdPercent) || 10,
    requestsPerPage: 1,
  };
}

module.exports = {
  parseBenchmarkConfig,
};
