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

function hostnameOf(parsed) {
  let hostname = parsed.hostname || "";
  if (hostname.charAt(0) === "[" && hostname.charAt(hostname.length - 1) === "]") {
    hostname = hostname.slice(1, -1);
  }
  return hostname;
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

  if (!hostnameOf(parsed)) {
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
  const hostname = hostnameOf(parsed);

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
  hostname = hostnameOf({ hostname: hostname });

  if (isIP(hostname)) {
    try {
      checkHostnameAddresses(hostname, [hostname], allowLoopback);
    } catch (e) {
      return callback(e);
    }
    const family = isIP(hostname);
    if (options && options.all) {
      return callback(null, [{ address: hostname, family: family }]);
    }
    return callback(null, hostname, family);
  }

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

function guardConnect(options) {
  const host = options && (options.host || options.hostname);
  if (!host) return;
  const hostname = hostnameOf({ hostname: host });
  if (!isIP(hostname)) return;
  checkHostnameAddresses(hostname, [hostname], allowLoopbackDefault());
}

function createGuardedAgent(Agent) {
  const agent = new Agent({ lookup: safeLookup, keepAlive: false });
  const original = agent.createConnection;
  agent.createConnection = function (options, callback) {
    try {
      guardConnect(options);
    } catch (err) {
      if (typeof callback === "function") {
        process.nextTick(function () {
          callback(err);
        });
        return;
      }
      throw err;
    }
    return original.call(this, options, callback);
  };
  return agent;
}

const httpAgent = createGuardedAgent(http.Agent);
const httpsAgent = createGuardedAgent(https.Agent);

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
