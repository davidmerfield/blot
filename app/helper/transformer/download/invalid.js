const dns = require("dns");
const net = require("net");

const protocols = ["http:", "https:"];

function invalid (url) {
  let parsed;

  try {
    parsed = new URL(url);
  } catch (e) {
    return new Error("Could not parse " + url);
  }

  if (!parsed.hostname || !parsed.protocol) {
    return new Error("Has no host or protocol " + url);
  }

  if (!protocols.includes(parsed.protocol)) {
    return new Error("Has unsupported protocol " + url);
  }

  return false;
}

async function resolvePublic (hostname) {
  hostname = hostname.replace(/^\[|\]$/g, "");
  const family = net.isIP(hostname);
  const addresses = family
    ? [{ address: hostname, family }]
    : await dns.promises.lookup(hostname, { all: true, verbatim: true });

  if (!addresses.length) throw new Error("Hostname resolved to no addresses");

  for (const result of addresses) {
    if (!isPublicAddress(result.address)) {
      throw new Error("Refusing to connect to non-public address " + result.address);
    }
  }

  return addresses;
}

function isPublicAddress (address) {
  const family = net.isIP(address);
  if (family === 4) return isPublicIPv4(address);
  if (family === 6) return isPublicIPv6(address);
  return false;
}

function isPublicIPv4 (address) {
  const octets = address.split(".").map(Number);
  if (octets.length !== 4 || octets.some(n => n < 0 || n > 255)) return false;
  const value = octets.reduce((result, octet) => (result * 256) + octet, 0);
  const inRange = (base, bits) => {
    const start = base.split(".").map(Number).reduce((r, n) => (r * 256) + n, 0);
    return Math.floor(value / Math.pow(2, 32 - bits)) === Math.floor(start / Math.pow(2, 32 - bits));
  };

  return ![
    ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10],
    ["127.0.0.0", 8], ["169.254.0.0", 16], ["172.16.0.0", 12],
    ["192.0.0.0", 24], ["192.0.2.0", 24], ["192.168.0.0", 16],
    ["198.18.0.0", 15], ["198.51.100.0", 24], ["203.0.113.0", 24],
    ["224.0.0.0", 4], ["240.0.0.0", 4]
  ].some(([base, bits]) => inRange(base, bits));
}

function isPublicIPv6 (address) {
  const bytes = ipv6Bytes(address);
  if (!bytes) return false;
  const prefix = (expected, bits) => {
    const full = Math.floor(bits / 8);
    const remainder = bits % 8;
    for (let i = 0; i < full; i++) if (bytes[i] !== expected[i]) return false;
    return !remainder || (bytes[full] >> (8 - remainder)) === (expected[full] >> (8 - remainder));
  };

  // Only global-unicast space is eligible, with IANA special-purpose ranges removed.
  if (!prefix([0x20], 3)) return false;
  if (prefix([0x20, 0x01, 0x00], 23)) return false;
  if (prefix([0x20, 0x01, 0x0d, 0xb8], 32)) return false;
  if (prefix([0x3f, 0xff], 20)) return false;
  return true;
}

function ipv6Bytes (address) {
  address = address.split("%")[0].toLowerCase();
  // IPv4-mapped IPv6 destinations are rejected in their entirety.
  if (address.includes(".")) return null;
  const halves = address.split("::");
  if (halves.length > 2) return null;
  const left = halves[0] ? halves[0].split(":") : [];
  const right = halves[1] ? halves[1].split(":") : [];
  const missing = 8 - left.length - right.length;
  if ((halves.length === 1 && missing !== 0) || missing < 0) return null;
  const groups = left.concat(Array(missing).fill("0"), right);
  if (groups.length !== 8 || groups.some(group => !/^[0-9a-f]{1,4}$/.test(group))) return null;
  return groups.flatMap(group => {
    const value = parseInt(group, 16);
    return [value >> 8, value & 255];
  });
}

module.exports = invalid;
module.exports.resolvePublic = resolvePublic;
module.exports.isPublicAddress = isPublicAddress;
