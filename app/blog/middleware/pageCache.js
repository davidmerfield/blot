const LRUCache = require("lru-cache").LRUCache;
const fromCloudflare = require("../lib/fromCloudflare");
const client = require("models/client");
const redirectsKey = require("models/redirects/key");
const hash = require("helper/hash");
const { fingerprintValue } = require("../lib/fingerprint");

// Process-local cache of fully rendered (or redirected) GET responses.
// Keyed by blog/template identity plus the request URL, so a popular
// site's repeat origin hits after nginx misses skip retrieve/Mustache/parse5.
const pageCache = new LRUCache({
  max: 1000,
  maxSize: 50 * 1024 * 1024,
  sizeCalculation: (value) =>
    value && typeof value.body === "string" ? Math.max(1, value.body.length) : 1,
});

const pageInflight = new Map();

function isCacheableStatus(status) {
  const code = Number(status) || 200;
  if (code === 200 || code === 404) return true;
  if (code >= 300 && code < 400) return true;
  return false;
}

function pageCacheKey(req, redirectsRev) {
  const blog = req.blog || {};
  const template = req.template || {};
  return JSON.stringify({
    blogID: String(blog.id),
    // cacheID does not move for avatar, permalink, title, domain, etc.
    // Fingerprint the whole blog record and the loaded template locals
    // so those dashboard edits miss this cache without waiting for eviction.
    blogState: hash(fingerprintValue(blog)),
    templateID: String(template.id),
    templateState: hash(
      fingerprintValue({
        locals: template.locals || {},
        cdn: template.cdn || {},
      })
    ),
    redirectsRev: String(redirectsRev || ""),
    url: String(req.url),
    host: String(req.originalHost || req.get("host") || ""),
    protocol: String(req.protocol),
    cloudflare: fromCloudflare(req) ? 1 : 0,
  });
}

async function resolvePageCacheKey(req) {
  let redirectsRev = "";
  try {
    if (req.blog && req.blog.id) {
      redirectsRev = (await client.get(redirectsKey.redirectsRev(req.blog.id))) || "";
    }
  } catch (e) {
    redirectsRev = "";
  }
  return pageCacheKey(req, redirectsRev);
}

function shouldCachePage(req) {
  if (!req || req.method !== "GET") return false;
  if (req.preview) return false;
  if (req.query && (req.query.debug || req.query.json || req.query.scheduled || req.query.source)) {
    return false;
  }

  const path = req.path || "";
  if (path === "/random" || path.startsWith("/random/")) return false;
  if (path === "/draft" || path.startsWith("/draft/")) return false;
  if (path.startsWith("/__blot/")) return false;
  return true;
}

function responseHeaders(res) {
  return {
    "Content-Type": res.get("Content-Type"),
    "Last-Modified": res.get("Last-Modified"),
    "Cache-Control": res.get("Cache-Control"),
    Location: res.get("Location"),
  };
}

function applyCachedResponse(res, cached) {
  if (cached.status) res.status(cached.status);
  const headers = cached.headers || {};
  if (headers["Content-Type"]) res.set("Content-Type", headers["Content-Type"]);
  if (headers["Last-Modified"]) res.set("Last-Modified", headers["Last-Modified"]);
  if (headers["Cache-Control"]) res.set("Cache-Control", headers["Cache-Control"]);
  if (headers.Location) res.set("Location", headers.Location);
}

function sendCached(res, cached) {
  if (
    cached.headers &&
    cached.headers.Location &&
    cached.status >= 300 &&
    cached.status < 400
  ) {
    return res.redirect(cached.status, cached.headers.Location);
  }
  applyCachedResponse(res, cached);
  return res.send(cached.body);
}

module.exports = async function pageCacheMiddleware(req, res, next) {
  if (!shouldCachePage(req) || !req.blog || !req.template) return next();

  let key;
  try {
    key = await resolvePageCacheKey(req);
  } catch (err) {
    return next();
  }

  const cached = pageCache.get(key);
  if (
    cached &&
    (typeof cached.body === "string" ||
      (cached.headers && cached.headers.Location))
  ) {
    if (typeof req.log === "function") req.log("Rendered page cache hit");
    return sendCached(res, cached);
  }

  const inflight = pageInflight.get(key);
  if (inflight) {
    inflight
      .then((entry) => {
        if (entry && typeof entry.body === "string") {
          if (typeof req.log === "function") {
            req.log("Rendered page cache coalesced");
          }
          return sendCached(res, entry);
        }
        next();
      })
      .catch(() => next());
    return;
  }

  let resolveInflight;
  const pending = new Promise((resolve) => {
    resolveInflight = resolve;
  });
  pageInflight.set(key, pending);

  const originalSend = res.send.bind(res);
  const originalRedirect = res.redirect.bind(res);
  let settled = false;

  function finish(entry) {
    if (settled) return;
    settled = true;
    resolveInflight(entry);
    if (pageInflight.get(key) === pending) pageInflight.delete(key);
  }

  res.send = function (body) {
    if (typeof body === "string" && isCacheableStatus(res.statusCode)) {
      const entry = {
        body,
        status: res.statusCode,
        headers: responseHeaders(res),
      };
      pageCache.set(key, entry);
      finish(entry);
    } else {
      finish(null);
    }
    return originalSend(body);
  };

  // Express 4 redirect uses res.end, not res.send, so HTML caching
  // above would miss canonical-URL 301s and user-configured redirects.
  res.redirect = function (statusOrUrl, url) {
    let status = 302;
    let location = statusOrUrl;
    if (arguments.length >= 2) {
      if (typeof statusOrUrl === "number") {
        status = statusOrUrl;
        location = url;
      } else {
        status = url;
        location = statusOrUrl;
      }
    }

    if (isCacheableStatus(status) && typeof location === "string") {
      const entry = {
        body: "",
        status,
        headers: { Location: location },
      };
      pageCache.set(key, entry);
      finish(entry);
    } else {
      finish(null);
    }
    return originalRedirect.apply(res, arguments);
  };

  res.on("close", () => finish(null));
  res.on("finish", () => finish(null));

  return next();
};

module.exports._createCacheKey = pageCacheKey;
module.exports._shouldCachePage = shouldCachePage;
module.exports._isCacheableStatus = isCacheableStatus;
module.exports._clear = function () {
  pageCache.clear();
  pageInflight.clear();
};
