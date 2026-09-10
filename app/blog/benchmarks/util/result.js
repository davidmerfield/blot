function buildBenchmarkResult(options) {
  const {
    benchmarkConfig,
    workload,
    buildPhaseMetrics,
    buildDurations,
    buildSiteDurations,
    renderPhaseMetrics,
    renderTiming,
    renderBytesTotal,
    siteSummaries,
    renderTasks,
    renderFailures,
    writeTimingByWorkload = { ordinary: {}, largeContent: {} },
    renderTimingByWorkload = { ordinary: {}, largeContent: {} },
    renderBytesByWorkload = { ordinary: 0, largeContent: 0 },
  } = options;

  const renderedPages = renderTasks.length;
  const largeEntries = workload.largeEntries || [];

  return {
    schema_version: 1,
    timestamp: new Date().toISOString(),
    git_sha: process.env.GITHUB_SHA || null,
    config: {
      sites: benchmarkConfig.sites,
      files: benchmarkConfig.files,
      fixture_files_per_site: workload.fixtureCount,
      large_entry_count: benchmarkConfig.largeEntryCount,
      large_entry_kilobytes: benchmarkConfig.largeEntryKilobytes,
      images_per_media_entry: benchmarkConfig.imagesPerMediaEntry,
      seed: benchmarkConfig.seed,
      render_concurrency: benchmarkConfig.renderConcurrency,
      requests_per_page: benchmarkConfig.requestsPerPage,
      regression_threshold_percent: benchmarkConfig.regressionThresholdPercent,
      cpu_sample_interval_ms: benchmarkConfig.cpuSampleIntervalMs,
    },
    build: {
      files_total: workload.files.length,
      sites_total: benchmarkConfig.sites,
      timing_ms: {
        total: buildPhaseMetrics.timing_ms.total,
        p50: buildDurations.p50,
        p95: buildDurations.p95,
        mean: buildDurations.mean,
        min: buildDurations.min,
        max: buildDurations.max,
        count: buildDurations.count,
        per_site: buildSiteDurations,
      },
      cpu: buildPhaseMetrics.cpu,
      memory_mb: buildPhaseMetrics.memory_mb,
      workload_timing_ms: {
        ordinary_entries: writeTimingByWorkload.ordinary,
        large_content_entries: writeTimingByWorkload.largeContent,
      },
    },
    render: {
      sitemap_pages_total: renderTasks.length,
      non_2xx_total: renderFailures.length,
      timing_ms: {
        total: renderPhaseMetrics.timing_ms.total,
        p50: renderTiming.p50,
        p95: renderTiming.p95,
        mean: renderTiming.mean,
        min: renderTiming.min,
        max: renderTiming.max,
        count: renderTiming.count,
      },
      cpu: renderPhaseMetrics.cpu,
      memory_mb: renderPhaseMetrics.memory_mb,
      bytes: {
        total: renderBytesTotal || 0,
        mean_per_page:
          renderedPages > 0 ? (renderBytesTotal || 0) / renderedPages : 0,
      },
      workload_timing_ms: {
        ordinary_entries: renderTimingByWorkload.ordinary,
        large_content_entries: renderTimingByWorkload.largeContent,
      },
      workload_bytes: {
        ordinary_entries: renderBytesByWorkload.ordinary,
        large_content_entries: renderBytesByWorkload.largeContent,
      },
    },
    workload: {
      large_content: largeEntries.map((entry) => ({
        path: entry.path,
        link_path: entry.linkPath,
        bytes: entry.byteSize,
        feature_counts: entry.featureCounts,
      })),
    },
    sites: siteSummaries,
    status: "pass",
  };
}

module.exports = {
  buildBenchmarkResult,
};
