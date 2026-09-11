var url = require("url");

// Strips a leading "www." so we treat the www and bare-domain
// forms of a hostname as equivalent without needing to be strict
// about which one a particular URL uses.
function stripWWW(hostname) {
  return hostname.indexOf("www.") === 0 ? hostname.slice(4) : hostname;
}

// Returns the set of hostnames (lowercased, "www." stripped) that this
// blog is reachable at: its custom domain, if any, and its
// <handle>.blot.im subdomain.
function hostnames(options) {
  var hosts = [];

  if (options.domain) hosts.push(stripWWW(String(options.domain).toLowerCase()));

  if (options.baseURL) {
    try {
      var parsed = url.parse(options.baseURL);
      if (parsed.hostname) hosts.push(stripWWW(parsed.hostname.toLowerCase()));
    } catch (e) {}
  }

  return hosts;
}

// If `src` is a fully-qualified URL whose host is one of `ownHostnames`,
// returns the blog-root-relative path it maps onto (query string and hash
// dropped, since those don't correspond to anything on disk). Returns null
// if `src` isn't a URL, or isn't hosted on one of these hostnames.
function ownLocalPath(src, ownHostnames) {
  var parsed;

  try {
    parsed = url.parse(src);
  } catch (e) {
    return null;
  }

  if (!parsed.hostname || !parsed.protocol) return null;
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;

  var hostname = stripWWW(parsed.hostname.toLowerCase());

  if (ownHostnames.indexOf(hostname) === -1) return null;

  return parsed.pathname || "/";
}

module.exports = ownLocalPath;
module.exports.hostnames = hostnames;
