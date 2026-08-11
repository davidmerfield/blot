const fetch = require("node-fetch");
const fs = require("fs").promises;
const { createWriteStream } = require("fs");
const http = require("http");
const https = require("https");
const ensure = require("helper/ensure");
const UID = require("helper/makeUid");
const callOnce = require("helper/callOnce");
const tempDir = require("helper/tempDir")();
const nameFrom = require("helper/nameFrom");
const tidy = require("./tidy");
const invalid = require("./invalid");

const IF_NONE_MATCH = "If-None-Match";
const IF_MODIFIED_SINCE = "If-Modified-Since";
const LAST_MODIFIED = "last-modified";
const CACHE_CONTROL = "cache-control";
const MAX_REDIRECTS = 5;
const TIMEOUT = 5000;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const debug = function () {};

module.exports = function (url, headers, callback) {
  if (invalid(url)) return callback(new Error("Invalid URL " + url));
  headers = headers || {};
  ensure(url, "string").and(headers, "object").and(callback, "function");
  if (isFresh(headers)) return callback(null, null, headers);
  callback = callOnce(callback);

  const path = tempDir + UID(6) + "-" + nameFrom(url);
  const requestHeaders = {
    "User-Agent": "node-fetch",
    ...(headers.etag && { [IF_NONE_MATCH]: headers.etag }),
    ...(headers[LAST_MODIFIED] && { [IF_MODIFIED_SINCE]: headers[LAST_MODIFIED] })
  };

  download(url, requestHeaders)
    .then(async res => {
      const cacheControl = res.headers.get(CACHE_CONTROL);
      const lastModified = res.headers.get(LAST_MODIFIED);
      const expires = res.headers.get("expires");
      const etag = res.headers.get("etag");
      headers[LAST_MODIFIED] = lastModified || headers[LAST_MODIFIED] || "";
      headers.etag = etag || headers.etag || "";
      headers.expires = tidy.date(expires) || tidy.expire(cacheControl) || headers.expires || "";
      headers.url = headers.url || url;

      if (res.status === 304) return { status: 304, headers };
      if (!res.ok) throw new Error(res.status);

      const file = createWriteStream(path);
      res.body.pipe(file);
      await new Promise((resolve, reject) => {
        file.on("finish", resolve);
        file.on("error", reject);
        res.body.on("error", reject);
      });
      return { status: res.status, path, headers };
    })
    .then(result => {
      if (result.status === 304) {
        callback(null, null, result.headers);
      } else {
        callback(null, result.path, result.headers);
      }
    })
    .catch(err => {
      debug("Download error:", err);
      fs.unlink(path).catch(() => {});
      callback(err);
    });
};

async function download (initialUrl, initialHeaders) {
  let current = new URL(initialUrl);
  let requestHeaders = initialHeaders;

  for (let redirects = 0; ; redirects++) {
    const addresses = await invalid.resolvePublic(current.hostname);
    // Pin lookup to one member of the fully validated DNS answer. node-fetch still
    // uses the URL hostname for Host, TLS SNI, and certificate verification.
    const selected = addresses[0];
    const Agent = current.protocol === "https:" ? https.Agent : http.Agent;
    const agent = new Agent({
      lookup: (hostname, options, callback) => callback(null, selected.address, selected.family)
    });
    let res;
    try {
      res = await fetch(current.toString(), {
        headers: requestHeaders,
        redirect: "manual",
        timeout: TIMEOUT,
        agent
      });
    } catch (err) {
      agent.destroy();
      throw err;
    }
    if (!REDIRECT_STATUSES.has(res.status) || !res.headers.get("location")) return res;
    res.body.resume();
    if (redirects >= MAX_REDIRECTS) throw new Error("Maximum redirects exceeded");

    const next = new URL(res.headers.get("location"), current);
    if (invalid(next.toString())) throw new Error("Invalid redirect URL " + next);
    if (next.origin !== current.origin) {
      // Conditional validators can expose private resource state and are only
      // meaningful to the origin that issued them.
      requestHeaders = { "User-Agent": requestHeaders["User-Agent"] };
    }
    current = next;
  }
}

function isFresh (existing) {
  return existing && existing.url && existing.expires && new Date(existing.expires) > new Date();
}

module.exports.MAX_REDIRECTS = MAX_REDIRECTS;
