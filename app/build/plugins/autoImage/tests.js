const cheerio = require("cheerio");
const { render } = require("./index.js");

const validImageURLs = [
  "http://example.com/img.jpg",          // Valid absolute URL
  "https://example.com/photo.png",      // HTTPS with .png
  "http://example.com/dir/img.gif",     // Path with subdirectory
  "/img.jpg",                           // Valid relative path
  "/images/photo.png",                  // Relative path with nested folder
  "http://example.com/img.jpg#",     // URL with invalid hash fragment
  "http://example.com/img.jpg?",     // URL with invalid query string
  "https://cdn.example.com/img.webp",   // WebP format
  "http://example.com/img.jpg?size=large", // URL with query string
  "//example.com/img.svg",              // Protocol-relative URL
];

const invalidImageURLs = [
  "https://twitter.com/davidmerfieId/ST/500323409218117633", // Non-image URL
  "",                                // Empty string
  "ABC",                             // Non-URL string
  "ftp://example.com/img.jpg",       // Unsupported protocol (e.g., FTP)
  "http://example.com/",             // URL with no file extension
  "http://example.com/image",        // Missing file extension
  "/path/to/somewhere",              // Relative URL with no extension
  "http://",                         // Incomplete URL
];

const runTest = (html) => {
  return new Promise((resolve, reject) => {
    const $ = cheerio.load(html);
    render($, function (err) {
      if (err) return reject(err);
      resolve($.html());
    });
  });
};

describe("autoImage plugin", function () {
  it("converts bare links into images", async () => {
    for (const url of validImageURLs) {
      const html = `<p><a href='${url}'>${url}</a></p>`;
      const newHTML = await runTest(html);
      expect(newHTML).toContain(`<img src="${url}"`);
      expect(newHTML).not.toContain(`<a href`);
    }
  });

  it("ignores invalid URLs", async () => {
    for (const url of invalidImageURLs) {
      const html = `<p><a href='${url}'>${url}</a></p>`;
      const newHTML = await runTest(html);
      expect(newHTML).not.toContain(`<img src`);
      expect(newHTML).toContain(`<a href`);
    }
  });
});