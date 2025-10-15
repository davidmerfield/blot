const ensure = require("helper/ensure");
const { parse } = require("url");

// takes URL path, adds leading slash, removes trailing slash;

function urlNormalizer(url) {
  ensure(url, "string");

  if (!url) return "";

  try {
    const parsed = parse(url);
    url = (parsed && parsed.pathname) || "";
  } catch (e) {
    return "";
  }

  if (!url) return "";

  if (url.slice(0, 1) !== "/") url = "/" + url;

  if (url.slice(-1) === "/" && url.length > 1) url = url.slice(0, -1);

  url = url.split("//").join("/");

  return url.toLowerCase();
}

module.exports = urlNormalizer;
