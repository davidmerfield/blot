var url = require("url");
var config = require("config");

// Strips a leading "www." so we treat the www and bare-domain forms of a
// hostname as equivalent without needing to be strict about which one a
// particular URL uses.
function stripWWW(hostname) {
  return hostname.indexOf("www.") === 0 ? hostname.slice(4) : hostname;
}

// Returns the set of hostnames (lowercased, "www." stripped) a blog is
// reachable at, given either a blog-shaped object ({ domain, handle }) or
// the options object plugins receive ({ domain, baseURL }).
function hostnames(source) {
  source = source || {};

  var hosts = [];

  if (source.domain)
    hosts.push(stripWWW(String(source.domain).toLowerCase()));

  if (source.handle) {
    hosts.push(String(source.handle).toLowerCase() + "." + config.host);
  } else if (source.baseURL) {
    try {
      var parsed = url.parse(source.baseURL);
      if (parsed.hostname) hosts.push(stripWWW(parsed.hostname.toLowerCase()));
    } catch (e) {}
  }

  return hosts;
}

// If `src` is a fully-qualified URL whose host is one of `ownHostnames`,
// returns the blog-root-relative path it maps onto (query string and hash
// dropped, since those don't correspond to anything on disk). Returns null
// if `src` isn't hosted on one of these hostnames.
function resolve(src, ownHostnames) {
  if (!ownHostnames || !ownHostnames.length) return null;

  var parsed;

  try {
    parsed = url.parse(src);
  } catch (e) {
    return null;
  }

  if (!parsed.hostname) return null;

  var hostname = stripWWW(parsed.hostname.toLowerCase());

  if (ownHostnames.indexOf(hostname) === -1) return null;

  return parsed.pathname || "/";
}

module.exports = {
  hostnames: hostnames,
  resolve: resolve
};
