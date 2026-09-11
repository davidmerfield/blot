"use strict";

/**
 * Extract summary metrics from a benchmark result JSON (same shape as the
 * table printed at the end of a run).
 */
function metricsFromResult(result) {
  const build = result.build || {};
  const render = result.render || {};
  const buildTiming = build.timing_ms || {};
  const renderTiming = render.timing_ms || {};
  const totalWallMs = (buildTiming.total || 0) + (renderTiming.total || 0);
  const totalCpuMs =
    (build.cpu && (build.cpu.user_ms || 0) + (build.cpu.system_ms || 0)) +
    (render.cpu && (render.cpu.user_ms || 0) + (render.cpu.system_ms || 0));
  const totalCpuPercent =
    totalWallMs > 0 ? (totalCpuMs / totalWallMs) * 100 : 0;
  const totalMemoryMb = Math.max(
    (build.memory_mb && build.memory_mb.peak_rss) || 0,
    (render.memory_mb && render.memory_mb.peak_rss) || 0
  );
  const totalSeconds = totalWallMs / 1000;
  const tagBurst = render.tag_burst || {};
  const tagBurstTiming = tagBurst.burst_timing_ms || {};
  const archivesBurst = render.archives_burst || {};
  const archivesBurstTiming = archivesBurst.burst_timing_ms || {};
  return {
    totalCpuPercent,
    totalMemoryMb,
    totalSeconds,
    meanBuildMs: buildTiming.mean != null ? buildTiming.mean : 0,
    meanRenderMs: renderTiming.mean != null ? renderTiming.mean : 0,
    tagBurstP95Ms: tagBurstTiming.p95 != null ? tagBurstTiming.p95 : 0,
    tagBurstInflationRatio:
      tagBurst.inflation_ratio != null ? tagBurst.inflation_ratio : null,
    archivesBurstP95Ms:
      archivesBurstTiming.p95 != null ? archivesBurstTiming.p95 : 0,
    archivesBurstInflationRatio:
      archivesBurst.inflation_ratio != null
        ? archivesBurst.inflation_ratio
        : null,
  };
}

function fmtNum(n, width) {
  return String(n).padStart(width || 8);
}

/**
 * Print a comparison table: current -> branch for each metric.
 */
function printCompareTable(currentResult, branchResult) {
  const cur = metricsFromResult(currentResult);
  const br = metricsFromResult(branchResult);
  const label = (s) => ("  " + s).padEnd(26);

  console.log("");
  console.log(
    label("Total CPU") +
      fmtNum(cur.totalCpuPercent.toFixed(2), 8) +
      " %  ->  " +
      fmtNum(br.totalCpuPercent.toFixed(2), 8) +
      " %"
  );
  console.log(
    label("Total Memory") +
      fmtNum(Math.round(cur.totalMemoryMb), 8) +
      " mb  ->  " +
      fmtNum(Math.round(br.totalMemoryMb), 8) +
      " mb"
  );
  console.log("");
  console.log(
    label("Total time") +
      fmtNum(cur.totalSeconds.toFixed(1), 8) +
      " seconds  ->  " +
      fmtNum(br.totalSeconds.toFixed(1), 8) +
      " seconds"
  );
  console.log(
    label("Mean build time") +
      fmtNum(cur.meanBuildMs.toFixed(0), 8) +
      " ms per site  ->  " +
      fmtNum(br.meanBuildMs.toFixed(0), 8) +
      " ms per site"
  );
  console.log(
    label("Mean blog render time") +
      fmtNum(cur.meanRenderMs.toFixed(0), 8) +
      " ms per page  ->  " +
      fmtNum(br.meanRenderMs.toFixed(0), 8) +
      " ms per page"
  );
  console.log("");
  console.log(
    label("Tag burst p95") +
      fmtNum(cur.tagBurstP95Ms.toFixed(0), 8) +
      " ms  ->  " +
      fmtNum(br.tagBurstP95Ms.toFixed(0), 8) +
      " ms"
  );
  console.log(
    label("Tag burst inflation") +
      fmtNum(
        cur.tagBurstInflationRatio == null
          ? "n/a"
          : cur.tagBurstInflationRatio.toFixed(2),
        8
      ) +
      "x  ->  " +
      fmtNum(
        br.tagBurstInflationRatio == null
          ? "n/a"
          : br.tagBurstInflationRatio.toFixed(2),
        8
      ) +
      "x"
  );
  console.log(
    label("Archives burst p95") +
      fmtNum(cur.archivesBurstP95Ms.toFixed(0), 8) +
      " ms  ->  " +
      fmtNum(br.archivesBurstP95Ms.toFixed(0), 8) +
      " ms"
  );
  console.log(
    label("Archives burst inflation") +
      fmtNum(
        cur.archivesBurstInflationRatio == null
          ? "n/a"
          : cur.archivesBurstInflationRatio.toFixed(2),
        8
      ) +
      "x  ->  " +
      fmtNum(
        br.archivesBurstInflationRatio == null
          ? "n/a"
          : br.archivesBurstInflationRatio.toFixed(2),
        8
      ) +
      "x"
  );
  console.log("");
}

module.exports = {
  metricsFromResult,
  printCompareTable,
};
