var protocols = ["http:", "https:"];
var Url = require("url");
var { isBlockedHostLiteral } = require("helper/publicUrl");

function invalid(url) {
  var parsed;

  try {
    parsed = Url.parse(url);
  } catch (e) {
    return new Error("Could not parse " + url);
  }

  if (!parsed.host || !parsed.protocol)
    return new Error("Has no host or protocol " + url);

  if (protocols.indexOf(parsed.protocol) === -1)
    return new Error("Has unsupported protocol " + url);

  // Reject hosts given as a private/loopback/link-local IP literal. Hostnames
  // that resolve to such addresses (incl. via redirect or DNS rebinding) are
  // caught by the fetch agent in helper/publicUrl.
  if (isBlockedHostLiteral(parsed.hostname))
    return new Error("Resolves to a private address " + url);

  return false;
}

module.exports = invalid;
