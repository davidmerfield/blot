// Downloads performed by importers are deliberately capped at 25 MiB. Import
// files are buffered because their consumers (sharp and fs.outputFile) require a
// Buffer, but the cap is enforced while the response is streaming.
const MAX_RESPONSE_SIZE = 25 * 1024 * 1024;
const REQUEST_TIMEOUT = 10 * 1000;
const MAX_REDIRECTS = 5;

const dns = require("dns");
const http = require("http");
const https = require("https");
const net = require("net");

function ipv4Number(address) {
  return address.split(".").reduce((value, part) => value * 256 + Number(part), 0);
}

function inV4Range(address, base, bits) {
  const size = Math.pow(2, 32 - bits);
  return Math.floor(ipv4Number(address) / size) === Math.floor(ipv4Number(base) / size);
}

function parseIPv6(address) {
  address = address.split("%")[0].toLowerCase();
  if (address.includes(".")) {
    const lastColon = address.lastIndexOf(":");
    const v4 = ipv4Number(address.slice(lastColon + 1));
    address = address.slice(0, lastColon) + ":" + ((v4 >>> 16) & 0xffff).toString(16) + ":" + (v4 & 0xffff).toString(16);
  }
  const halves = address.split("::");
  if (halves.length > 2) return null;
  const left = halves[0] ? halves[0].split(":") : [];
  const right = halves[1] ? halves[1].split(":") : [];
  const fill = halves.length === 2 ? 8 - left.length - right.length : 0;
  const parts = left.concat(Array(fill).fill("0"), right);
  if (parts.length !== 8) return null;
  return parts.reduce((value, part) => (value << 16n) + BigInt(parseInt(part, 16)), 0n);
}

function isPublicAddress(address) {
  const family = net.isIP(address);
  if (family === 4) {
    const denied = [
      ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10],
      ["127.0.0.0", 8], ["169.254.0.0", 16], ["172.16.0.0", 12],
      ["192.0.0.0", 24], ["192.0.2.0", 24], ["192.88.99.0", 24],
      ["192.168.0.0", 16], ["198.18.0.0", 15], ["198.51.100.0", 24],
      ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4],
    ];
    return !denied.some((range) => inV4Range(address, range[0], range[1]));
  }
  if (family !== 6) return false;
  const value = parseIPv6(address);
  if (value === null) return false;
  // IPv4-mapped IPv6 addresses inherit the IPv4 address's classification.
  if ((value >> 32n) === 0xffffn) {
    const v4 = Number(value & 0xffffffffn);
    return isPublicAddress([v4 >>> 24, (v4 >>> 16) & 255, (v4 >>> 8) & 255, v4 & 255].join("."));
  }
  // Globally routable unicast IPv6 is in 2000::/3. Exclude IETF ranges which
  // are explicitly reserved for benchmarking, ORCHID, and documentation.
  if ((value >> 125n) !== 1n) return false;
  const denied = [
    [parseIPv6("2001:2::"), 48],
    [parseIPv6("2001:10::"), 28],
    [parseIPv6("2001:db8::"), 32],
  ];
  return !denied.some(([base, bits]) => value >> BigInt(128 - bits) === base >> BigInt(128 - bits));
}

function resolvePublic(hostname, lookup) {
  // WHATWG URL retains brackets around IPv6 literals in some Node releases.
  if (hostname.charAt(0) === "[" && hostname.charAt(hostname.length - 1) === "]")
    hostname = hostname.slice(1, -1);
  if (net.isIP(hostname)) {
    return isPublicAddress(hostname)
      ? Promise.resolve([{ address: hostname, family: net.isIP(hostname) }])
      : Promise.reject(new Error("Refusing non-public address: " + hostname));
  }
  return new Promise((resolve, reject) => {
    lookup(hostname, { all: true, verbatim: true }, (error, addresses) => {
      if (error) return reject(error);
      addresses = Array.isArray(addresses) ? addresses : [addresses];
      if (!addresses.length || addresses.some((item) => !item || !isPublicAddress(item.address))) {
        return reject(new Error("Hostname resolves to a non-public address: " + hostname));
      }
      resolve(addresses);
    });
  });
}

function validateUrl(value) {
  let url;
  try { url = new URL(value); } catch (error) { throw new Error("Invalid URL: " + value); }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("Unsupported URL protocol: " + url.protocol);
  if (url.username || url.password) throw new Error("URL credentials are not allowed");
  return url;
}

async function safeDownload(value, options) {
  options = options || {};
  const maxSize = options.maxSize || MAX_RESPONSE_SIZE;
  const timeout = options.timeout || REQUEST_TIMEOUT;
  const lookup = options.lookup || dns.lookup;
  let url = validateUrl(value);

  for (let redirects = 0; ; redirects += 1) {
    const addresses = await resolvePublic(url.hostname, lookup);
    const selected = addresses[0];
    const result = await request(url, selected, timeout, maxSize, options.contentTypes);
    if (result.redirect) {
      if (redirects >= (options.maxRedirects === undefined ? MAX_REDIRECTS : options.maxRedirects)) throw new Error("Too many redirects");
      url = validateUrl(new URL(result.redirect, url).toString());
      continue;
    }
    result.url = url.toString();
    return result;
  }
}

function request(url, selected, timeout, maxSize, contentTypes) {
  return new Promise((resolve, reject) => {
    const transport = url.protocol === "https:" ? https : http;
    const req = transport.get(url, {
      lookup: (_hostname, _options, callback) => callback(null, selected.address, selected.family),
    }, (response) => {
      const status = response.statusCode;
      if ([301, 302, 303, 307, 308].includes(status) && response.headers.location) {
        response.resume();
        return resolve({ redirect: response.headers.location });
      }
      if (status < 200 || status >= 300) { response.resume(); return reject(new Error("Bad status code: " + status)); }
      const type = String(response.headers["content-type"] || "").split(";", 1)[0].trim().toLowerCase();
      if (!type || (contentTypes && !contentTypes.some((allowed) => allowed.endsWith("/") ? type.startsWith(allowed) : type === allowed))) {
        response.resume();
        return reject(new Error("Unexpected content type: " + (type || "missing")));
      }
      const declared = Number(response.headers["content-length"]);
      if (declared && declared > maxSize) { response.destroy(); return reject(new Error("Response exceeds maximum size of " + maxSize + " bytes")); }
      const chunks = [];
      let size = 0;
      response.on("data", (chunk) => {
        size += chunk.length;
        if (size > maxSize) return response.destroy(new Error("Response exceeds maximum size of " + maxSize + " bytes"));
        chunks.push(chunk);
      });
      response.on("end", () => resolve({ data: Buffer.concat(chunks), headers: {
        contentType: response.headers["content-type"],
        contentDisposition: response.headers["content-disposition"],
      }}));
      response.on("error", reject);
    });
    req.setTimeout(timeout, () => req.destroy(new Error("Download timed out after " + timeout + "ms")));
    req.on("error", reject);
  });
}

safeDownload.MAX_RESPONSE_SIZE = MAX_RESPONSE_SIZE;
safeDownload.REQUEST_TIMEOUT = REQUEST_TIMEOUT;
safeDownload.isPublicAddress = isPublicAddress;
safeDownload.validateUrl = validateUrl;
module.exports = safeDownload;
