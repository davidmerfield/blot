const fetch = require("node-fetch");
const cheerio = require("cheerio");
const fs = require("fs-extra");
const cache_directory = __dirname + "/data/cache";
const hash = str =>
  require("crypto").createHash("md5").update(str).digest("hex");

// check if the file exists in the cache
// if it does, return the contents
// if it doesn't, fetch the page, save it to the cache, and return the contents
const getHTML = async url => {
  const filename = `${cache_directory}/index-urls/${hash(url)}.html`;

  if (!fs.existsSync(filename)) {
    // wait 2 seconds to avoid triggering the rate limit
    await new Promise(resolve => setTimeout(resolve, 2000));

    const response = await fetch(url);

    if (response.status !== 200) {
      throw new Error("Bad status: " + response.status);
    }

    const html = await response.text();
    fs.outputFileSync(filename, html, "utf-8");
  }

  return fs.readFileSync(filename, "utf-8");
};

module.exports = async url => {
  const result = [];

  // strip the 'sp' parameter from the url to get the base url
  // it can be prefixed with either '&' or '?'
  const baseUrl = url.replace(/&?sp=\d+/, "");

  let page = 1;
  let items;

  do {
    const pageUrl = `${baseUrl}&sp=${page}`;
    console.log("Fetching page", pageUrl);
    const html = await getHTML(pageUrl);
    const $ = cheerio.load(html);
    items = $("a[href*='/item/']").map((i, el) => $(el).attr("href"));
    result.push(...items.get());
    page++;
  } while (items.length);

  const uniqueItems = [...new Set(result)];

  return uniqueItems;
};
