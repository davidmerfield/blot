var { parseHttpUrl } = require("helper/ssrf");

function invalid(url) {
  try {
    parseHttpUrl(url);
  } catch (e) {
    return e instanceof Error ? e : new Error("Could not parse " + url);
  }

  return false;
}

module.exports = invalid;
