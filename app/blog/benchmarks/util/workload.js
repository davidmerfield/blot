const { getFixtures } = require("./fixtures");
const assert = require("assert");
const { BENCHMARK_DEFAULTS } = require("./defaults");

const LARGE_FEATURE_MINIMUMS = Object.freeze({
  headings: 48,
  listDepth: 10,
  tableRows: 64,
  footnoteReferences: 48,
  codeFences: 8,
  internalLinks: 64,
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
      workload: "ordinary",
    });
  }

  const largeEntries = [];
  const largeEntryCount =
    config.largeEntryCount == null
      ? BENCHMARK_DEFAULTS.largeEntryCount
      : config.largeEntryCount;
  const largeEntryKilobytes =
    config.largeEntryKilobytes || BENCHMARK_DEFAULTS.largeEntryKilobytes;
  const imagesPerMediaEntry =
    config.imagesPerMediaEntry || BENCHMARK_DEFAULTS.imagesPerMediaEntry;
  for (let index = 0; index < largeEntryCount; index++) {
    const blogIndex = index % blogs.length;
    const slug = `benchmark-large-${index}`;
    const generated = makeLargeEntryContent({
      index,
      slug,
      seed: config.seed,
      targetBytes: largeEntryKilobytes * 1024,
      imagesPerMediaEntry,
    });
    const repeated = makeLargeEntryContent({
      index,
      slug,
      seed: config.seed,
      targetBytes: largeEntryKilobytes * 1024,
      imagesPerMediaEntry,
    });
    assert.strictEqual(
      generated.content,
      repeated.content,
      "seeded large entry output is not byte-for-byte reproducible"
    );
    const entry = {
      blogIndex,
      path: `/benchmark-large/${slug}.txt`,
      linkPath: `/${slug}`,
      content: generated.content,
      workload: "large-content",
      byteSize: generated.byteSize,
      featureCounts: generated.featureCounts,
    };
    files.push(entry);
    largeEntries.push(entry);
    filesPerSite[blogIndex] += 1;
  }

  const fixtures = getFixtures();
  for (let blogIndex = 0; blogIndex < blogs.length; blogIndex++) {
    for (const { sourcePath, targetPath } of fixtures) {
      files.push({ blogIndex, path: targetPath, sourcePath, workload: "fixture" });
      filesPerSite[blogIndex] += 1;
    }
  }

  return {
    files,
    filesPerSite,
    fixtureCount: fixtures.length,
    largeEntries,
  };
}

/**
 * Produce an exactly-sized UTF-8 markdown document. At the defaults each entry
 * is approximately 256 KiB and contains all parser-heavy feature families. The
 * final ASCII padding makes byte size stable even though the document uses
 * multibyte Unicode text.
 */
function makeLargeEntryContent(options) {
  const { index, slug, seed, targetBytes, imagesPerMediaEntry } = options;
  const lines = [
    `Title: Large benchmark ${index}`,
    `Link: /${slug}`,
    "Benchmark-Workload: large-content",
    "",
    `Seed marker: ${seed} — Καλημέρα κόσμε — こんにちは世界 — مرحبًا بالعالم — 🌍`,
    "",
  ];

  for (let i = 1; i <= LARGE_FEATURE_MINIMUMS.headings; i++) {
    lines.push(`${"#".repeat(1 + ((i - 1) % 6))} Deterministic section ${i}`);
    lines.push(`Unicode paragraph ${i}: naïve café, Ελληνικά, 中文, हिन्दी, العربية, 🚀.`);
  }

  lines.push("# Deeply nested list");
  for (let depth = 0; depth < LARGE_FEATURE_MINIMUMS.listDepth; depth++) {
    lines.push(`${"  ".repeat(depth)}- nested level ${depth + 1}`);
  }

  lines.push(
    "",
    "# Large table",
    "| Row | Key | Unicode | Link |",
    "| ---: | --- | --- | --- |"
  );
  for (let i = 1; i <= LARGE_FEATURE_MINIMUMS.tableRows; i++) {
    lines.push(
      `| ${i} | cell-${index}-${i} | 東京 café ✓ | [section ${i}](#deterministic-section-${i}) |`
    );
  }

  lines.push("", "# Footnotes and internal links");
  for (let i = 1; i <= LARGE_FEATURE_MINIMUMS.footnoteReferences; i++) {
    lines.push(
      `Repeated note reference ${i}[^shared] and [entry link ${i}](/benchmark-large-${i % 7}).`
    );
  }
  lines.push(
    "",
    "[^shared]: One deliberately repeated footnote definition target.",
    ""
  );

  const languages = [
    "javascript",
    "python",
    "ruby",
    "go",
    "rust",
    "css",
    "html",
    "sql",
  ];
  languages.forEach((language, i) => {
    lines.push(
      "```" + language,
      `// deterministic ${language} example ${i}\nvalue_${i} = "${seed}"`,
      "```",
      ""
    );
  });

  lines.push("# Image-heavy gallery");
  const images = ["bunny.png", "sky.webp", "land.avif"];
  for (let i = 0; i < imagesPerMediaEntry; i++) {
    lines.push(
      `![Gallery image ${i + 1}](/benchmark-fixtures/${
        images[i % images.length]
      } "Fixture ${i + 1}")`
    );
  }

  // Repeat deterministic prose to exercise long block parsing, then pad to an
  // exact byte boundary. No random state or platform-specific newline is used.
  const paragraph = `\nCorpus ${index}: The quick benchmark paragraph links [home](/) and preserves Unicode Ω雪🙂. `;
  let content = lines.join("\n") + "\n";
  while (Buffer.byteLength(content + paragraph, "utf8") <= targetBytes) {
    content += paragraph;
  }
  const remaining = targetBytes - Buffer.byteLength(content, "utf8");
  assert(
    remaining >= 0,
    "largeEntryKilobytes is too small for required features"
  );
  content += " ".repeat(remaining);

  const featureCounts = countLargeEntryFeatures(content);
  assert.strictEqual(Buffer.byteLength(content, "utf8"), targetBytes);
  for (const [feature, minimum] of Object.entries(LARGE_FEATURE_MINIMUMS)) {
    assert(
      featureCounts[feature] >= minimum,
      `${feature} generator count fell below ${minimum}`
    );
  }
  assert(
    featureCounts.images === imagesPerMediaEntry,
    "gallery image count changed"
  );
  return { content, byteSize: targetBytes, featureCounts };
}

function countLargeEntryFeatures(content) {
  const lines = content.split("\n");
  const indents = lines
    .filter((line) => /^\s*- nested level/.test(line))
    .map((line) => line.match(/^\s*/)[0].length / 2 + 1);
  return {
    headings: lines.filter((line) => /^#{1,6} /.test(line)).length,
    listDepth: Math.max(0, ...indents),
    tableRows: lines.filter((line) => /^\| \d+ \|/.test(line)).length,
    footnoteReferences: (content.match(/\[\^shared\]/g) || []).length - 1,
    codeFences: (content.match(/^```[^\n]+$/gm) || []).length,
    internalLinks: (content.match(/\]\(\/(?!\/)/g) || []).length,
    images: (content.match(/^!\[Gallery image /gm) || []).length,
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

module.exports = {
  buildWorkload,
  makeEntryContent,
  randomSentence,
  randomWord,
  makeLargeEntryContent,
  countLargeEntryFeatures,
  LARGE_FEATURE_MINIMUMS,
};
