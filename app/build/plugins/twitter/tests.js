const cheerio = require("cheerio");
const { render } = require("./index.js");

const validTweetURLs = [
  "https://x.com/Interior/status/463440424141459456",
  "https://twitter.com/Interior/status/463440424141459456"
];

const invalidTweetURLs = [
  "http://twatter.com/davidmerfieId/status/500323409218117633",
  "http://twitter.foo.com/davidmerfieId/status/500323409218117633",
  "https://twitter.com/davidmerfieId/500323409218117633",
  "https://twitter.com/davidmerfieId/status",
  "https://twitter.com/davidmerfieId/ST/500323409218117633",
  "",
  "ABC",
];

const runTest = (html) => {
  return new Promise((resolve, reject) => {
    const $ = cheerio.load(html);
    render($, function (err) {
      if (err) return reject(err);
      resolve($.html());
    });
  });
}

describe("twitter plugin", function () {

  global.test.timeout(10000); // 10 seconds

  it("handles valid URLs", async () => {

    // wait for 5 seconds
    await new Promise((resolve) => setTimeout(resolve, 5000));
    
    for (const url of validTweetURLs) {
      const html = `<p><a href='${url}'>${url}</a></p>`;
      const newHTML = await runTest(html);
      // newHTML should contain a script tag and a blockquote tag
      expect(newHTML).toContain(`<script async="" src="https://platform.twitter.com/widgets.js" charset="utf-8">`);
      expect(newHTML).toContain(`<blockquote class="twitter-tweet"`);
    }
  });

  it("ignores invalid URLs", async () => {
    for (const url of invalidTweetURLs) {
      const html = `<p><a href='${url}'>${url}</a></p>`;
      const newHTML = await runTest(html);
      // newHTML should be the same as the original html
      expect(newHTML).not.toContain(`<script async="" src="https://platform.twitter.com/widgets.js" charset="utf-8">`);
      expect(newHTML).not.toContain(`<blockquote class="twitter-tweet">`);
    }
  });
});
