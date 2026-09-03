const net = require("net");
const dns = require("dns");
const { Agent: HttpAgent } = require("http");
const { Agent: HttpsAgent } = require("https");
const config = require("config");

const ALLOWED_PROTOCOLS = ["http:", "https:"];

// Address blocking is enforced in production only. In development the test
// suite and local tooling legitimately talk to localhost / private services;
// the exposure the blocking addresses (cloud metadata endpoint, internal
// services) only exists on the hosted deployment. Overridable for tests.
let enabled = config.environment === "production";
const setEnabled = (value) => {
  enabled = !!value;
};

// Address ranges that must never be reachable from a server-side fetch:
// loopback, "this network", RFC1918 private space, CGNAT, link-local (which
// includes the cloud metadata endpoint 169.254.169.254), benchmarking,
// multicast, reserved, and their IPv6 equivalents (unspecified, loopback,
// unique-local, link-local, multicast).
const blocklist = new net.BlockList();

blocklist.addSubnet("0.0.0.0", 8);
blocklist.addSubnet("10.0.0.0", 8);
blocklist.addSubnet("100.64.0.0", 10);
blocklist.addSubnet("127.0.0.0", 8);
blocklist.addSubnet("169.254.0.0", 16);
blocklist.addSubnet("172.16.0.0", 12);
blocklist.addSubnet("192.0.0.0", 24);
blocklist.addSubnet("192.168.0.0", 16);
blocklist.addSubnet("198.18.0.0", 15);
blocklist.addSubnet("224.0.0.0", 4);
blocklist.addSubnet("240.0.0.0", 4);

blocklist.addAddress("::", "ipv6");
blocklist.addAddress("::1", "ipv6");
blocklist.addSubnet("fc00::", 7, "ipv6");
blocklist.addSubnet("fe80::", 10, "ipv6");
blocklist.addSubnet("ff00::", 8, "ipv6");

// Pure classifier, independent of `enabled`. Fails closed: anything that is not
// a recognisable, routable public IP literal is treated as blocked.
function isBlockedAddress(address) {
  let family = net.isIP(address);
  if (family === 0) return true;

  // Normalise IPv4-mapped IPv6 (e.g. ::ffff:127.0.0.1) down to plain IPv4 so it
  // is checked against the IPv4 ranges above.
  if (
    family === 6 &&
    address.toLowerCase().startsWith("::ffff:") &&
    address.includes(".")
  ) {
    address = address.slice(address.lastIndexOf(":") + 1);
    family = net.isIP(address);
    if (family === 0) return true;
  }

  return blocklist.check(address, family === 6 ? "ipv6" : "ipv4");
}

// For helper/transformer/download/invalid.js: is this host, given as an IP
// literal, one we must refuse? Hostnames are left to safeLookup below.
function isBlockedHostLiteral(hostname) {
  if (!enabled) return false;
  hostname = (hostname || "").replace(/^\[|\]$/g, "");
  return net.isIP(hostname) !== 0 && isBlockedAddress(hostname);
}

// A dns.lookup-compatible function that rejects when the hostname resolves to a
// blocked address. Passed as the `lookup` option to the fetch agents below so
// the check runs against the address actually connected to — on the initial
// request, on every redirect hop, and defeating DNS rebinding.
function safeLookup(hostname, options, callback) {
  if (typeof options === "function") {
    callback = options;
    options = {};
  }

  dns.lookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return callback(err);

    if (enabled) {
      for (const { address } of addresses) {
        if (isBlockedAddress(address)) {
          return callback(
            new Error(
              "Refusing to connect to blocked address " +
                address +
                " (" +
                hostname +
                ")"
            )
          );
        }
      }
    }

    if (options.all) return callback(null, addresses);
    callback(null, addresses[0].address, addresses[0].family);
  });
}

const httpAgent = new HttpAgent({ lookup: safeLookup });
const httpsAgent = new HttpsAgent({ lookup: safeLookup });

// For node-fetch's `agent` option, which is called with the (possibly
// post-redirect) parsed URL.
function agent(url) {
  return url.protocol === "https:" ? httpsAgent : httpAgent;
}

// Pre-flight guard for a single URL: rejects unless it is an http(s) URL whose
// host is, or resolves to, a public address. Callers that then perform the
// request through their own client (e.g. Chrome) should still guard each
// request, as this check is subject to TOCTOU on its own.
async function assertPublicUrl(url) {
  let parsed;

  try {
    parsed = new URL(url);
  } catch (e) {
    throw new Error("Invalid URL " + url);
  }

  if (!ALLOWED_PROTOCOLS.includes(parsed.protocol))
    throw new Error("Unsupported protocol " + parsed.protocol + " in " + url);

  if (!enabled) return parsed;

  const hostname = parsed.hostname.replace(/^\[|\]$/g, "");

  if (net.isIP(hostname)) {
    if (isBlockedAddress(hostname))
      throw new Error("Blocked address " + hostname + " in " + url);
    return parsed;
  }

  const addresses = await dns.promises.lookup(hostname, { all: true });

  if (addresses.length === 0) throw new Error("Could not resolve " + hostname);

  for (const { address } of addresses) {
    if (isBlockedAddress(address))
      throw new Error(
        "Host " + hostname + " resolves to blocked address " + address
      );
  }

  return parsed;
}

module.exports = {
  assertPublicUrl,
  isBlockedAddress,
  isBlockedHostLiteral,
  safeLookup,
  agent,
  blocklist,
  setEnabled
};
