const fs = require("fs-extra");
const html = require("build/converters/html");
const markdown = require("build/converters/markdown");
const markdownWithoutPandoc = require("build/converters/markdown-without-pandoc");
const {
  MAX_POST_SOURCE_SIZE_BYTES,
} = require("build/converters/post-source-size");

describe("post source size limit", function () {
  global.test.blog();
  global.test.timeout(30 * 1000);

  [".txt", ".text", ".md", ".markdown"].forEach((extension) => {
    it(`recognizes ${extension} in lower and mixed case`, function () {
      expect(markdown.is(`/post${extension}`)).toBe(true);
      expect(markdownWithoutPandoc.is(`/post${mixedCase(extension)}`)).toBe(true);
    });
  });

  [".html", ".htm"].forEach((extension) => {
    it(`recognizes ${extension} in lower and mixed case`, function () {
      expect(html.is(`/post${extension}`)).toBe(true);
      expect(html.is(`/post${mixedCase(extension)}`)).toBe(true);
    });
  });

  const implementations = [
    ["Pandoc Markdown", markdown, ".md"],
    ["Markdown without Pandoc", markdownWithoutPandoc, ".markdown"],
    ["HTML", html, ".html"],
  ];

  implementations.forEach(([name, converter, extension]) => {
    it(`${name} accepts a file exactly at the limit`, function (done) {
      const entryPath = `/at-limit${extension}`;
      fs.outputFileSync(
        this.blogDirectory + entryPath,
        Buffer.alloc(MAX_POST_SOURCE_SIZE_BYTES, 32)
      );

      converter.read(this.blog, entryPath, function (err, output, stat) {
        if (err) return done.fail(err);
        expect(typeof output).toBe("string");
        expect(stat.size).toBe(MAX_POST_SOURCE_SIZE_BYTES);
        done();
      });
    });
  });

  [
    ...[".txt", ".text", ".md", ".markdown"].map((extension) => [
      "Pandoc Markdown",
      markdown,
      extension,
    ]),
    ...[".txt", ".text", ".md", ".markdown"].map((extension) => [
      "Markdown without Pandoc",
      markdownWithoutPandoc,
      extension,
    ]),
    ["HTML", html, ".html"],
    ["HTML", html, ".htm"],
  ].forEach(([name, converter, extension]) => {
    it(`${name} rejects ${extension} one byte over the limit`, function (done) {
      const entryPath = `/over-limit${extension}`;
      fs.outputFileSync(
        this.blogDirectory + entryPath,
        Buffer.alloc(MAX_POST_SOURCE_SIZE_BYTES + 1, 32)
      );

      converter.read(this.blog, entryPath, function (err) {
        expect(err).toEqual(jasmine.any(Error));
        expect(err.code).toBe("TOO_LARGE");
        done();
      });
    });
  });
});

function mixedCase(extension) {
  return extension
    .split("")
    .map((character, index) =>
      index % 2 ? character.toUpperCase() : character
    )
    .join("");
}
