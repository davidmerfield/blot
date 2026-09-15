// Detect Cloudflare-proxied requests. Some Cloudflare SSL modes fetch from
// the origin over HTTP, which would cause mixed-content warnings or redirect
// loops if we treated those as plain HTTP clients.
//
// Incoming header names are already lowercased by Node's HTTP parser, so we
// can test the common Cloudflare headers directly and only scan keys if needed.
module.exports = function fromCloudflare(req) {
  const headers = req && req.headers;
  if (!headers) return false;

  if (
    headers["cf-connecting-ip"] !== undefined ||
    headers["cf-ray"] !== undefined ||
    headers["cf-visitor"] !== undefined ||
    headers["cf-ipcountry"] !== undefined
  ) {
    return true;
  }

  for (const key in headers) {
    if (key.length > 3 && key.charCodeAt(0) === 99 && key.charCodeAt(1) === 102 && key.charCodeAt(2) === 45) {
      return true;
    }
  }

  return false;
};
