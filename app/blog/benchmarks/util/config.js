function parseBenchmarkConfig(raw = {}) {
  return {
    sites: Number(raw.sites) || 5,
    files: Number(raw.files) || 1000,
    seed: String(raw.seed || "blot-benchmark-seed"),
    renderConcurrency: Number(raw.renderConcurrency) || 8,
    cpuSampleIntervalMs: Number(raw.cpuSampleIntervalMs) || 250,
    regressionThresholdPercent: Number(raw.regressionThresholdPercent) || 10,
    requestsPerPage: Math.max(1, Math.floor(Number(raw.requestsPerPage) || 10)),
  };
}

module.exports = {
  parseBenchmarkConfig,
};
