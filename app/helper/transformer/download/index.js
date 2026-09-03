const fetch = require("node-fetch");
const fs = require("fs").promises;
const { createWriteStream } = require("fs");
const ensure = require("helper/ensure");
const UID = require("helper/makeUid");
const callOnce = require("helper/callOnce");
const tempDir = require("helper/tempDir")();
const nameFrom = require("helper/nameFrom");
const tidy = require("./tidy");
const invalid = require("./invalid");
const { assertPublicHttpUrl, requestAgent } = require("helper/ssrf");

const IF_NONE_MATCH = "If-None-Match";
const IF_MODIFIED_SINCE = "If-Modified-Since";
const LAST_MODIFIED = "last-modified";
const CACHE_CONTROL = "cache-control";

const MAX_REDIRECTS = 5;
const TIMEOUT = 5000; // 5s
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

const debug = function () {}; // console.log || noop for debugging

module.exports = function (url, headers, callback) {
  // Verify the url has a host, and protocol
  if (invalid(url)) return callback(new Error("Invalid URL " + url));

  // Sometimes these are null for new urls...
  headers = headers || {};

  ensure(url, "string").and(headers, "object").and(callback, "function");

  // The expire date is greater than now!
  // We don't need to download anything.
  if (isFresh(headers)) return callback(null, null, headers);

  callback = callOnce(callback);

  const path = tempDir + UID(6) + "-" + nameFrom(url);

  const options = {
    headers: {
      "User-Agent": "node-fetch",
      ...(headers.etag && { [IF_NONE_MATCH]: headers.etag }),
      ...(headers[LAST_MODIFIED] && {
        [IF_MODIFIED_SINCE]: headers[LAST_MODIFIED]
      })
    },
    agent: requestAgent,
    redirect: "manual",
    timeout: TIMEOUT
  };

  debug("Downloading", url, "to", path, "with fetch headers:");
  debug(print(options.headers));

  let file;

  assertPublicHttpUrl(url)
    .then(() => {
      file = createWriteStream(path);
      return fetchFollowingRedirects(url, options, MAX_REDIRECTS);
    })
    .then(res => {
      debug("Received response:");

      const cacheControl = res.headers.get(CACHE_CONTROL);
      const lastModified = res.headers.get(LAST_MODIFIED);
      const expires = res.headers.get("expires");
      const etag = res.headers.get("etag");

      headers[LAST_MODIFIED] = lastModified || headers[LAST_MODIFIED] || "";
      headers.etag = etag || headers.etag || "";
      headers.expires =
        tidy.date(expires) ||
        tidy.expire(cacheControl) ||
        headers.expires ||
        "";
      headers.url = headers.url || url;

      if (res.status === 304) {
        debug("  it has 304 unchanged status");
        file.end(); // close the file stream as we won't write anything to it
        return { status: 304, headers };
      }

      if (!res.ok) {
        debug("  it has a bad status code:", res.status);
        throw new Error(res.status);
      }

      debug("  updated latest response headers for status", res.status);
      res.body.pipe(file); // start piping the response body to the file

      return new Promise((resolve, reject) => {
        file.on("finish", () => resolve({ status: res.status, path, headers }));
        file.on("error", reject);
      });
    })
    .then(result => {
      if (!result) return;

      if (result.status === 304) {
        debug("Calling back with cached headers for 304 response:");
        debug(print(result.headers));
        fs.unlink(path).catch(() => {});
        callback(null, null, result.headers);
        return;
      }

      debug("Calling back with path", result.path, "and res headers:");
      debug(print(result.headers));
      callback(null, result.path, result.headers);
    })
    .catch(err => {
      debug("Download error:", err);
      if (file) file.close();
      fs.unlink(path).catch(() => {});
      callback(err);
    });
};

function fetchFollowingRedirects(url, options, hopsLeft) {
  return fetch(url, options).then(function (res) {
    if (!REDIRECT_STATUSES.has(res.status)) return res;

    if (hopsLeft <= 0) throw new Error("Too many redirects");

    const location = res.headers.get("location");
    if (!location) throw new Error("Redirect missing Location");

    if (res.body && typeof res.body.resume === "function") res.body.resume();

    const next = new URL(location, url).toString();
    return assertPublicHttpUrl(next).then(function () {
      return fetchFollowingRedirects(next, options, hopsLeft - 1);
    });
  });
}

function isFresh (existing) {
  return (
    existing &&
    existing.url &&
    existing.expires &&
    new Date(existing.expires) > new Date()
  );
}

function print (obj) {
  return Object.entries(obj)
    .map(([key, value]) => `  ${key}: "${value}"`)
    .join("\n");
}
