const fs = require("fs-extra");
const LocalPath = require("helper/localPath");

const markdownConvert = require("../../../converters/markdown/convert");
const htmlConverter = require("../../../converters/html");
const gdocConverter = require("../../../converters/gdoc");
const markdownWithoutPandoc = require(
  "../../../converters/markdown-without-pandoc"
);

describe("converter math normalization", function () {
  const blog = {
    id: "math-normalization-test",
    plugins: { linebreaks: { enabled: false } },
  };
  const blogDirectory = LocalPath(blog.id, "/");

  beforeEach(async function () {
    await fs.emptyDir(blogDirectory);
  });

  function readWith(converter, filePath) {
    return new Promise((resolve, reject) => {
      converter.read(blog, filePath, (err, html) => {
        if (err) return reject(err);
        resolve(html);
      });
    });
  }

  function convertMarkdown(text) {
    return new Promise((resolve, reject) => {
      markdownConvert(blog, text, {}, (err, html) => {
        if (err) return reject(err);
        resolve(html);
      });
    });
  }

  const fixtures = [
    {
      name: "pandoc markdown",
      inline: "Inline $a+b$ math",
      display: "$$c=d$$",
      convert(content) {
        return convertMarkdown(content);
      },
    },
    {
      name: "html",
      path: "/math-normalization.html",
      inline: "<p>Inline $a+b$ math</p>",
      display: "<p>$$c=d$$</p>",
      convert() {
        return readWith(htmlConverter, this.path);
      },
    },
    {
      name: "gdoc",
      path: "/math-normalization.gdoc",
      inline: "<html><body><p>Inline $a+b$ math</p></body></html>",
      display: "<html><body><p>$$<br>c=d<br>$$</p></body></html>",
      convert() {
        return readWith(gdocConverter, this.path);
      },
    },
    {
      name: "markdown without pandoc",
      path: "/math-normalization.md",
      inline: "Inline $a+b$ math",
      display: "$$c=d$$",
      convert() {
        return readWith(markdownWithoutPandoc, this.path);
      },
    },
  ];

  const cases = [
    { mode: "inline", expected: '<span class="math inline">a+b</span>' },
    { mode: "display", expected: '<span class="math display">c=d</span>' },
  ];

  fixtures.forEach((fixture) => {
    cases.forEach(({ mode, expected }) => {
      it(
        fixture.name +
          " emits normalized " +
          mode +
          " span.math HTML before KaTeX",
        async function () {
          const content = fixture[mode];

          if (fixture.path) {
            await fs.outputFile(LocalPath(blog.id, fixture.path), content);
          }

          const html = await fixture.convert.call(fixture, content);

          expect(html).toContain(expected);
          expect(html).not.toContain('class="katex"');
        }
      );
    });
  });
});
