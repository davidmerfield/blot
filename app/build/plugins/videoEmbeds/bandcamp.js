const fetch = require("node-fetch");
const cheerio = require("cheerio");
const { parse } = require("url");

const ERROR_MESSAGE = "Could not retrieve song properties";

module.exports = async function (href, callback) {
  try {
    const { hostname, pathname } = parse(href);
    const path = pathname.toLowerCase();

    if (!hostname.endsWith("bandcamp.com")) {
      return callback(new Error(ERROR_MESSAGE));
    }

    if (!path || !path.match(/\/(album|track)/)) {
      return callback(new Error(ERROR_MESSAGE));
    }

    const res = await fetch(href);
    const body = await res.text();
    const $ = cheerio.load(body, null, false);

    const width = Number($('meta[property="og:video:width"]').attr("content"));
    const height = Number(
      $('meta[property="og:video:height"]').attr("content")
    );

    let src = $('meta[property="og:video"]').attr("content");

    if (!src || isNaN(height) || isNaN(width)) {
      return callback(new Error(ERROR_MESSAGE));
    }

    // we prepend a zero-width char because of a weird
    // bug on mobile safari where if the embed is the first child,
    // the video player will not show. This causes issues with
    // inline elements displaying (adds extra space) solution needed
    // that doesn't disrupt page layout...
    const embedHTML = `<div style="width:0;height:0"> </div><div class="videoContainer bandcamp" style="padding-bottom: ${height}px"><iframe width="${width}" height="${height}" src="${src}" frameborder="0" webkitallowfullscreen mozallowfullscreen allowfullscreen></iframe></div>`;

    callback(null, embedHTML);
  } catch (error) {
    callback(new Error(ERROR_MESSAGE));
  }
};
