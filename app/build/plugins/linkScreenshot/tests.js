describe("linkScreenshot plugin", function () {
  const { render } = require("./index.js");
  const cheerio = require("cheerio");

  const opts = { blogID: "blog_test", path: "/bookmark.webloc" };

  // Builds a cheerio doc holding a single bookmark link, the shape the
  // webloc converter produces before this plugin runs.
  const doc = (href) =>
    cheerio.load(`<p><a class="bookmark" href="${href}">Example</a></p>`);

  // A URL this plugin must refuse to hand to the screenshot service. These
  // never reach helper/screenshot, so no browser is launched.
  const refused = [
    "javascript:alert(1)",
    "file:///etc/passwd",
    "ftp://example.com/x",
    "http://user:secret@example.com/",
    "https://:secret@example.com/",
    "not-a-url",
  ];

  refused.forEach((href) => {
    it("refuses " + href, function (done) {
      const $ = doc(href);

      render($, function () {
        // The link is left untouched - no screenshot wrapper was added.
        expect($.html()).not.toContain("bookmark-container");
        expect($.html()).not.toContain("bookmark-screenshot");
        done();
      }, opts);
    });
  });

  it("does nothing when there is no href", function (done) {
    const $ = cheerio.load(`<p><a class="bookmark">Example</a></p>`);

    render($, function () {
      expect($.html()).not.toContain("bookmark-container");
      done();
    }, opts);
  });

  it("does nothing for a non-webloc path", function (done) {
    const $ = doc("https://example.com/");

    render($, function () {
      expect($.html()).not.toContain("bookmark-container");
      done();
    }, { blogID: "blog_test", path: "/note.txt" });
  });
});
