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

module.exports = {
  extractPathsFromSitemap,
  decodeXmlEntities,
};
