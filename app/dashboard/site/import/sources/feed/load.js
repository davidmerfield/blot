const fetch = require("node-fetch");
const cheerio = require("cheerio");

module.exports = async function load (feed_url) {
  if (!feed_url) throw new Error("Please pass a URL to an RSS feed");

  const response = await fetch(feed_url);
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  const body = await response.text();

  const $ = cheerio.load(body, {
    decodeEntities: false,
    xmlMode: true
  });

  return $;
};
