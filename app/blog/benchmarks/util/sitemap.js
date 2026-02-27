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

function isSitemapUrl(pathname) {
  return /sitemap.*\.xml$/i.test(pathname);
}

/**
 * Expand sitemap index: fetch /sitemap.xml, then follow any <loc> that point to
 * another sitemap (e.g. sitemap-pages.xml) and collect all page URLs. Returns
 * every URL that should be requested (no duplicates).
 */
async function expandSitemapUrls(blog, sitemapXml, getForBlog) {
  const allPaths = new Set();

  // Sanity: log raw sitemap snippet (first 800 chars)
  const snippet = sitemapXml.slice(0, 800).replace(/\n/g, " ");
  console.log("[benchmark:sitemap]", blog.handle, "raw sitemap (first 800 chars):", snippet);

  // Log raw <loc> content before URL parsing (first 3 and one from middle)
  const locPattern = /<loc>([^<]+)<\/loc>/g;
  const rawLocs = [];
  let m;
  while ((m = locPattern.exec(sitemapXml)) !== null) rawLocs.push(m[1].trim());
  console.log(
    "[benchmark:sitemap]",
    blog.handle,
    "raw <loc> #0:",
    rawLocs[0],
    " #1:",
    rawLocs[1],
    " #2:",
    rawLocs[2],
    rawLocs.length > 10 ? " #" + Math.floor(rawLocs.length / 2) + ": " + rawLocs[Math.floor(rawLocs.length / 2)] : ""
  );

  const initialPaths = extractPathsFromSitemap(sitemapXml);

  console.log(
    "[benchmark:sitemap]",
    blog.handle,
    "initial /sitemap.xml <loc> count:",
    initialPaths.length
  );
  if (initialPaths.length > 0 && initialPaths.length <= 10) {
    console.log("[benchmark:sitemap]", blog.handle, "initial paths:", initialPaths);
  } else if (initialPaths.length > 10) {
    console.log(
      "[benchmark:sitemap]",
      blog.handle,
      "first 5:",
      initialPaths.slice(0, 5),
      "... last 2:",
      initialPaths.slice(-2)
    );
  }

  const sitemapPaths = initialPaths.filter(isSitemapUrl);
  const pagePaths = initialPaths.filter((p) => !isSitemapUrl(p));
  pagePaths.forEach((p) => allPaths.add(p));

  console.log(
    "[benchmark:sitemap]",
    blog.handle,
    "sitemap URLs to follow:",
    sitemapPaths.length,
    sitemapPaths.length ? sitemapPaths : ""
  );
  console.log(
    "[benchmark:sitemap]",
    blog.handle,
    "page URLs from main sitemap:",
    pagePaths.length
  );

  for (const sitemapPath of sitemapPaths) {
    const res = await getForBlog(blog, sitemapPath, { redirect: "manual" });
    console.log(
      "[benchmark:sitemap]",
      blog.handle,
      "fetch",
      sitemapPath,
      "-> status",
      res.status
    );
    if (res.status !== 200) continue;
    const xml = await res.text();
    const paths = extractPathsFromSitemap(xml);
    console.log(
      "[benchmark:sitemap]",
      blog.handle,
      sitemapPath,
      "<loc> count:",
      paths.length
    );
    paths.forEach((p) => allPaths.add(p));
  }

  const final = Array.from(allPaths);
  console.log(
    "[benchmark:sitemap]",
    blog.handle,
    "total unique URLs for render:",
    final.length
  );
  return final;
}

function decodeXmlEntities(value) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) =>
      String.fromCharCode(parseInt(hex, 16))
    )
    .replace(/&#(\d+);/g, (_, dec) =>
      String.fromCharCode(parseInt(dec, 10))
    );
}

module.exports = {
  extractPathsFromSitemap,
  expandSitemapUrls,
  decodeXmlEntities,
};
