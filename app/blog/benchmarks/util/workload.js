const { getFixtures } = require("./fixtures");

// Modelled on a real customer blog that suffered severe request-queueing
// slowdowns: several hundred entries, each carrying a handful of tags out of
// a few dozen distinct ones, so most tag pages have a healthy number of
// matching entries rather than one or two.
function buildTagPool(config, rng) {
  const tagCount = Math.max(0, Math.floor(config.tags));
  const pool = [];

  for (let i = 0; i < tagCount; i++) {
    pool.push(`benchmark-tag-${i}-${randomWord(rng, 6)}`);
  }

  return pool;
}

function pickTags(rng, tagPool) {
  if (!tagPool.length) return [];

  const tagsPerEntry = 1 + Math.floor(rng() * 4); // 1-4 tags, like real posts
  const picked = new Set();

  for (let i = 0; i < tagsPerEntry && picked.size < tagPool.length; i++) {
    picked.add(tagPool[Math.floor(rng() * tagPool.length)]);
  }

  return Array.from(picked);
}

function buildWorkload(config, blogs, rng) {
  const files = [];
  const filesPerSite = new Array(blogs.length).fill(0);
  const tagPoolBySite = blogs.map(() => buildTagPool(config, rng));
  const tagsUsedBySite = blogs.map(() => new Set());

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
    const tags = pickTags(rng, tagPoolBySite[blogIndex]);
    tags.forEach((tag) => tagsUsedBySite[blogIndex].add(tag));

    files.push({
      blogIndex,
      path: filePath,
      content: makeEntryContent({ rng, slug, blogIndex, index, tags }),
    });
  }

  const fixtures = getFixtures();
  for (let blogIndex = 0; blogIndex < blogs.length; blogIndex++) {
    for (const { sourcePath, targetPath } of fixtures) {
      files.push({ blogIndex, path: targetPath, sourcePath });
      filesPerSite[blogIndex] += 1;
    }
  }

  return {
    files,
    filesPerSite,
    fixtureCount: fixtures.length,
    tagsBySite: tagsUsedBySite.map((set) => Array.from(set)),
  };
}

function makeEntryContent({ rng, slug, blogIndex, index, tags }) {
  const sentenceCount = 3 + Math.floor(rng() * 5);
  const sentences = [];

  for (let i = 0; i < sentenceCount; i++) {
    sentences.push(randomSentence(rng));
  }

  const header = [`Title: Benchmark ${blogIndex}-${index}`, `Link: /${slug}`];

  if (tags && tags.length) {
    header.push(`Tags: ${tags.join(", ")}`);
  }

  return [...header, "", sentences.join(" "), ""].join("\n");
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
};
