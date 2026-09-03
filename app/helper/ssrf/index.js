const dns = require("dns");
const http = require("http");
const https = require("https");
const { isIP } = require("net");
const config = require("config");
const { isPrivateIP, isLoopback } = require("./isPrivateIP");

const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);

function allowLoopbackDefault() {
  return config.environment !== "production";
}

function ssrfError(target, reason) {
  const err = new Error("Blocked request to " + target + ": " + reason);
  err.code = "ERR_SSRF";
  return err;
}

function parseHttpUrl(input) {
  if (!input || typeof input !== "string") {
    throw new Error("URL is required");
  }

  let parsed;
  try {
    parsed = new URL(input);
  } catch (e) {
    throw new Error("Could not parse " + input);
  }

  if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) {
    throw new Error("Has unsupported protocol " + input);
  }

  if (!parsed.hostname) {
    throw new Error("Has no host " + input);
  }

  return parsed;
}

function addressesAllowed(addresses, allowLoopback) {
  const ips = addresses
    .map(function (item) {
      return typeof item === "string" ? item : item && item.address;
    })
    .filter(Boolean);

  if (!ips.length) return false;

  if (!ips.some(isPrivateIP)) return true;

  return !!(allowLoopback && ips.every(isLoopback));
}

function checkHostnameAddresses(hostname, addresses, allowLoopback) {
  if (!addresses || !addresses.length || !addressesAllowed(addresses, allowLoopback)) {
    const ips = (addresses || [])
      .map(function (item) {
        return typeof item === "string" ? item : item && item.address;
      })
      .filter(Boolean)
      .join(", ");
    throw ssrfError(
      hostname,
      ips ? "Resolves to private address " + ips : "No usable addresses"
    );
  }
}

async function resolveAddresses(hostname, lookupFn) {
  if (lookupFn) {
    const result = await lookupFn(hostname, { all: true });
    return Array.isArray(result) ? result : [result];
  }

  return dns.promises.lookup(hostname, { all: true, verbatim: true });
}

async function assertPublicHttpUrl(input, options) {
  options = options || {};
  const parsed = parseHttpUrl(input);
  const allowLoopback =
    options.allowLoopback !== undefined
      ? options.allowLoopback
      : allowLoopbackDefault();
  const hostname = parsed.hostname;

  if (isIP(hostname)) {
    checkHostnameAddresses(hostname, [hostname], allowLoopback);
    return parsed;
  }

  const addresses = await resolveAddresses(hostname, options.lookup);
  checkHostnameAddresses(hostname, addresses, allowLoopback);
  return parsed;
}

function safeLookup(hostname, options, callback) {
  if (typeof options === "function") {
    callback = options;
    options = {};
  }

  const allowLoopback = allowLoopbackDefault();

  dns.lookup(hostname, Object.assign({}, options, { all: true }), function (
    err,
    addresses
  ) {
    if (err) return callback(err);

    try {
      checkHostnameAddresses(hostname, addresses, allowLoopback);
    } catch (e) {
      return callback(e);
    }

    if (options && options.all) return callback(null, addresses);

    callback(null, addresses[0].address, addresses[0].family);
  });
}

const httpAgent = new http.Agent({ lookup: safeLookup, keepAlive: false });
const httpsAgent = new https.Agent({ lookup: safeLookup, keepAlive: false });

function requestAgent(parsedURL) {
  return parsedURL.protocol === "http:" ? httpAgent : httpsAgent;
}

module.exports = {
  isPrivateIP,
  isLoopback,
  parseHttpUrl,
  assertPublicHttpUrl,
  requestAgent,
  safeLookup,
  ssrfError,
};
