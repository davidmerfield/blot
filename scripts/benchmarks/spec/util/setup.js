const sharedSetup = require("../../../../app/blog/tests/util/sharedSetup");
const setupCorpusRender = require("./corpusSetup");

module.exports = function setupBenchmark(options = {}) {
  const benchmarkConfig = global.__BLOT_BENCHMARK_CONFIG || {};

  // corpusMode "render" runs against blogs from an already-built, restored
  // corpus (see corpusSetup.js) rather than creating fresh ones.
  if (benchmarkConfig.corpusMode === "render") {
    return setupCorpusRender(benchmarkConfig.corpusManifestPath);
  }

  const blogs = Number(options.blogs || benchmarkConfig.sites || 5);

  return sharedSetup({
    blogs,
    ...options,
  });
};
