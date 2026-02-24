const seedrandom = require("seedrandom");
const { performance } = require("perf_hooks");
const { PhaseMonitor, summarizeDurations } = require("./util/metrics");

describe("blog benchmarks", function () {
  require("./util/setup")();

  global.test.timeout(20 * 60 * 1000);

  it("measures build and sitemap render performance", async function () {
    const rawConfig = global.__BLOT_BENCHMARK_CONFIG || {};
    const benchmarkConfig = {
      sites: Number(rawConfig.sites) || 5,
      files: Number(rawConfig.files) || 1000,
      seed: String(rawConfig.seed || "blot-benchmark-seed"),
      renderConcurrency:
        Number(rawConfig.renderConcurrency) || 8,
      cpuSampleIntervalMs:
        Number(rawConfig.cpuSampleIntervalMs) || 250,
      regressionThresholdPercent:
        Number(rawConfig.regressionThresholdPercent) || 10,
    };

    const blogs = Array.isArray(this.blogs) && this.blogs.length
      ? this.blogs
      : this.blog
      ? [this.blog]
      : [];

    if (blogs.length !== benchmarkConfig.sites) {
      throw new Error(
        `Expected ${benchmarkConfig.sites} benchmark sites but got ${blogs.length}`
      );
    }

    const rng = seedrandom(benchmarkConfig.seed);
    const workload = buildWorkload(benchmarkConfig, blogs, rng);

    const buildPhaseMonitor = new PhaseMonitor({
      sampleIntervalMs: benchmarkConfig.cpuSampleIntervalMs,
    });

    const writeTasks = workload.files.map((file) => ({
      ...file,
      blog: blogs[file.blogIndex],
    }));

    const buildSiteDurations = [];

    buildPhaseMonitor.start();

    await runWithConcurrency(writeTasks, 32, async (task) => {
      await task.blog.write({ path: task.path, content: task.content });
    });

    await Promise.all(
      blogs.map(async (blog, index) => {
        const startedAt = performance.now();
        await blog.rebuild();
        buildSiteDurations[index] = performance.now() - startedAt;
      })
    );

    const buildPhaseMetrics = buildPhaseMonitor.stop();
    const buildDurations = summarizeDurations(buildSiteDurations);

    const renderPhaseMonitor = new PhaseMonitor({
      sampleIntervalMs: benchmarkConfig.cpuSampleIntervalMs,
    });

    const renderDurations = [];
    const renderFailures = [];
    const siteSummaries = [];
    const renderTasks = [];

    for (let index = 0; index < blogs.length; index++) {
      const blog = blogs[index];
      const sitemapRes = await this.getForBlog(blog, "/sitemap.xml", {
        redirect: "manual",
      });

      if (sitemapRes.status !== 200) {
        throw new Error(
          `Failed to fetch sitemap.xml for ${blog.handle}: status=${sitemapRes.status}`
        );
      }

      const sitemapXML = await sitemapRes.text();
      const sitemapPaths = Array.from(new Set(extractPathsFromSitemap(sitemapXML)));

      if (!sitemapPaths.length) {
        throw new Error(`No sitemap paths found for blog ${blog.handle}`);
      }

      siteSummaries.push({
        blog_id: blog.id,
        handle: blog.handle,
        files_written: workload.filesPerSite[index] || 0,
        sitemap_page_count: sitemapPaths.length,
      });

      for (const path of sitemapPaths) {
        renderTasks.push({ blogIndex: index, blog, path });
      }
    }

    renderPhaseMonitor.start();

    await runWithConcurrency(
      renderTasks,
      benchmarkConfig.renderConcurrency,
      async ({ blogIndex, blog, path }) => {
        const startedAt = performance.now();
        const res = await this.getForBlog(blog, path, { redirect: "manual" });
        await res.arrayBuffer();

        const elapsedMs = performance.now() - startedAt;
        renderDurations.push(elapsedMs);

        if (res.status >= 400) {
          renderFailures.push({ blogIndex, path, status: res.status });
        }
      }
    );

    const renderPhaseMetrics = renderPhaseMonitor.stop();
    const renderTiming = summarizeDurations(renderDurations);

    for (const summary of siteSummaries) {
      summary.rendered_pages = renderTasks.filter(
        (task) => task.blog.id === summary.blog_id
      ).length;
      summary.non_2xx = renderFailures.filter(
        (failure) => blogs[failure.blogIndex].id === summary.blog_id
      ).length;
    }

    const result = {
      schema_version: 1,
      timestamp: new Date().toISOString(),
      git_sha: process.env.GITHUB_SHA || null,
      config: {
        sites: benchmarkConfig.sites,
        files: benchmarkConfig.files,
        seed: benchmarkConfig.seed,
        render_concurrency: benchmarkConfig.renderConcurrency,
        regression_threshold_percent: benchmarkConfig.regressionThresholdPercent,
        cpu_sample_interval_ms: benchmarkConfig.cpuSampleIntervalMs,
      },
      build: {
        files_total: benchmarkConfig.files,
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
      },
      sites: siteSummaries,
      status: "pass",
    };

    global.__BLOT_BENCHMARK_RESULT = result;

    expect(workload.files.length).toEqual(benchmarkConfig.files);
    expect(renderTasks.length).toBeGreaterThan(0);
    expect(renderFailures.length).toEqual(0);

    console.log("[benchmark] build total ms:", result.build.timing_ms.total.toFixed(2));
    console.log("[benchmark] build p50 ms:", result.build.timing_ms.p50.toFixed(2));
    console.log("[benchmark] build cpu:", result.build.cpu);
    console.log("[benchmark] build memory:", result.build.memory_mb);
    console.log("[benchmark] render total ms:", result.render.timing_ms.total.toFixed(2));
    console.log("[benchmark] render p50 ms:", result.render.timing_ms.p50.toFixed(2));
    console.log("[benchmark] render cpu:", result.render.cpu);
    console.log("[benchmark] render memory:", result.render.memory_mb);
  });
});

function buildWorkload(config, blogs, rng) {
  const files = [];
  const filesPerSite = new Array(blogs.length).fill(0);

  for (let index = 0; index < config.files; index++) {
    const blogIndex = index % blogs.length;
    filesPerSite[blogIndex] += 1;

    const depth = 1 + Math.floor(rng() * 3);
    const segments = [];

    for (let i = 0; i < depth; i++) {
      segments.push(randomWord(rng, 6 + Math.floor(rng() * 8)));
    }

    const slug = `benchmark-${blogIndex}-${index}-${randomWord(rng, 8)}`;
    const filePath = `/${segments.join("/")}/${slug}.txt`;

    files.push({
      blogIndex,
      path: filePath,
      content: makeEntryContent({ rng, slug, blogIndex, index }),
    });
  }

  return {
    files,
    filesPerSite,
  };
}

function makeEntryContent({ rng, slug, blogIndex, index }) {
  const sentenceCount = 3 + Math.floor(rng() * 5);
  const sentences = [];

  for (let i = 0; i < sentenceCount; i++) {
    sentences.push(randomSentence(rng));
  }

  return [
    `Title: Benchmark ${blogIndex}-${index}`,
    `Link: /${slug}`,
    "",
    sentences.join(" "),
    "",
  ].join("\n");
}

function randomSentence(rng) {
  const words = [];
  const wordCount = 8 + Math.floor(rng() * 10);

  for (let index = 0; index < wordCount; index++) {
    words.push(randomWord(rng, 3 + Math.floor(rng() * 7)));
  }

  const first = words[0];
  words[0] = first[0].toUpperCase() + first.slice(1);

  return `${words.join(" ")}.`;
}

function randomWord(rng, length) {
  const chars = "abcdefghijklmnopqrstuvwxyz";
  let output = "";

  while (output.length < length) {
    const idx = Math.floor(rng() * chars.length);
    output += chars[idx];
  }

  return output;
}

function extractPathsFromSitemap(xml) {
  const locPattern = /<loc>([^<]+)<\/loc>/g;
  const paths = [];

  let match;
  while ((match = locPattern.exec(xml)) !== null) {
    const rawLoc = decodeXmlEntities(match[1].trim());

    try {
      const parsed = new URL(rawLoc);
      paths.push(parsed.pathname + (parsed.search || ""));
    } catch (err) {
      // ignore malformed sitemap entries while still benchmarking valid pages
    }
  }

  return paths;
}

function decodeXmlEntities(value) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

async function runWithConcurrency(items, limit, worker) {
  const queue = [...items];
  const workers = [];
  const size = Math.max(1, Math.floor(limit));

  for (let i = 0; i < size; i++) {
    workers.push(
      (async () => {
        while (queue.length) {
          const item = queue.shift();
          if (!item) continue;
          await worker(item);
        }
      })()
    );
  }

  await Promise.all(workers);
}
