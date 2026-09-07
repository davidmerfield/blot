const config = require("config");
const http = require("http");
const nodeFetch = require("node-fetch");
const { HttpProxyAgent } = require("http-proxy-agent");
const { HttpsProxyAgent } = require("https-proxy-agent");

// App-side entry point for the "airlock" container (config/airlock) - the
// single egress boundary for fetching untrusted, user-supplied URLs. The
// airlock's in-kernel nftables egress filter is the actual SSRF control
// (it matches the real destination IP at connect() time, so it also covers
// redirects, sub-resources and DNS-rebinding); everything in this module is
// just the wiring to route a fetch through the airlock's forward proxy, plus
// the fail-closed assertion below.
//
// Fail closed: in production a caller that hands us a user-controlled URL
// must go through the airlock. If the proxy isn't configured (a deploy that
// missed BLOT_AIRLOCK_PROXY_URL on some container) we throw here rather than
// letting the caller fall back to fetching the URL directly with no SSRF
// protection. The individual operation fails and its caller degrades
// gracefully (a post builds without the image, a domain check errors) - the
// app still boots and serves. Outside production (dev, tests) nothing is
// required and fetches go direct.

// True in production (see config/index.js). Both BLOT_AIRLOCK_* vars set on
// every app container is the deployed state; see config/airlock/README.md.
const required = !!(config.airlock && config.airlock.required);

const proxyUrl = (config.airlock && config.airlock.proxy) || null;
const browserUrl = (config.airlock && config.airlock.browser_url) || null;

const proxyConfigured = !!proxyUrl;
const browserConfigured = !!browserUrl;

// node-fetch's `agent` option accepts a function of the parsed URL, so one
// value covers both http: and https: targets (and redirects between them).
const httpProxyAgent = proxyUrl ? new HttpProxyAgent(proxyUrl) : null;
const httpsProxyAgent = proxyUrl ? new HttpsProxyAgent(proxyUrl) : null;
const proxyAgent = proxyUrl
  ? (parsedURL) =>
      parsedURL.protocol === "https:" ? httpsProxyAgent : httpProxyAgent
  : undefined;

function assertProxyReady(label) {
  if (required && !proxyConfigured) {
    throw new Error(
      `airlock: refusing to fetch a user-controlled URL${
        label ? " (" + label + ")" : ""
      } - BLOT_AIRLOCK_PROXY_URL is not set. See config/airlock/README.md.`
    );
  }
}

function assertBrowserReady(label) {
  if (required && !browserConfigured) {
    throw new Error(
      `airlock: refusing to screenshot a user-controlled URL${
        label ? " (" + label + ")" : ""
      } - BLOT_AIRLOCK_BROWSER_URL is not set. See config/airlock/README.md.`
    );
  }
}

// Drop-in replacement for require("node-fetch") at a user-controlled sink:
// applies the airlock proxy agent and enforces fail-closed. Any options the
// caller passes (headers, signal, redirect, timeout, ...) are forwarded
// unchanged; an explicit `agent` wins over the proxy agent.
async function fetch(url, options = {}) {
  assertProxyReady(options.airlockLabel);
  const { airlockLabel, ...fetchOptions } = options;
  if (fetchOptions.agent === undefined && proxyAgent !== undefined) {
    fetchOptions.agent = proxyAgent;
  }
  return nodeFetch(url, fetchOptions);
}

function abortError() {
  const e = new Error("The operation was aborted");
  e.name = "AbortError";
  return e;
}

// GET a fixed destination IP through the airlock, with an explicit Host
// header. This exists for app/dashboard/site/domain/verify.js: it resolves
// the domain itself (authoritative nameservers + public fallback resolvers)
// and must connect to THAT IP - during DNS propagation or split-horizon the
// airlock's own resolver can disagree. A normal proxied fetch can't express
// this: http-proxy-agent rebuilds the request-line URI from the Host header,
// so the IP is dropped and the proxy re-resolves the name. Here the proxied
// request line targets `http://<ip><path>` (tinyproxy connects to that IP;
// the egress filter still re-checks it) while the Host header carries the
// real domain so Blot's proxy identifies the blog. Fails closed like fetch().
// Resolves { status, text }.
function getViaIP(ip, path, { host, timeout, signal, label } = {}) {
  assertProxyReady(label || "domain/verify");

  return new Promise((resolve, reject) => {
    const headers = { Host: host, Connection: "close" };
    let options;

    if (proxyUrl) {
      const proxy = new URL(proxyUrl);
      options = {
        host: proxy.hostname,
        port: proxy.port || 80,
        method: "GET",
        path: `http://${ip}${path}`,
        headers,
      };
    } else {
      options = { host: ip, port: 80, method: "GET", path, headers };
    }

    const req = http.request(options, (res) => {
      let text = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => (text += chunk));
      res.on("end", () => resolve({ status: res.statusCode, text }));
    });

    if (timeout) {
      req.setTimeout(timeout, () => {
        const e = new Error("request-timeout");
        e.type = "request-timeout";
        req.destroy(e);
      });
    }

    if (signal) {
      if (signal.aborted) {
        req.destroy(abortError());
      } else {
        signal.addEventListener("abort", () => req.destroy(abortError()), {
          once: true,
        });
      }
    }

    req.on("error", reject);
    req.end();
  });
}

module.exports = {
  required,
  proxyConfigured,
  browserConfigured,
  proxyAgent,
  assertProxyReady,
  assertBrowserReady,
  fetch,
  getViaIP,
};
