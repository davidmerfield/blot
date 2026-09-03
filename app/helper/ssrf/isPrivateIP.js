const { BlockList, isIP } = require("net");

const privateV4 = new BlockList();
privateV4.addSubnet("0.0.0.0", 8, "ipv4");
privateV4.addSubnet("10.0.0.0", 8, "ipv4");
privateV4.addSubnet("100.64.0.0", 10, "ipv4");
privateV4.addSubnet("127.0.0.0", 8, "ipv4");
privateV4.addSubnet("169.254.0.0", 16, "ipv4");
privateV4.addSubnet("172.16.0.0", 12, "ipv4");
privateV4.addSubnet("192.168.0.0", 16, "ipv4");

const privateV6 = new BlockList();
privateV6.addAddress("::", "ipv6");
privateV6.addAddress("::1", "ipv6");
privateV6.addSubnet("fc00::", 7, "ipv6");
privateV6.addSubnet("fe80::", 10, "ipv6");

const loopbackV4 = new BlockList();
loopbackV4.addSubnet("127.0.0.0", 8, "ipv4");

const loopbackV6 = new BlockList();
loopbackV6.addAddress("::1", "ipv6");

function stripZone(ip) {
  const idx = String(ip).indexOf("%");
  return idx === -1 ? ip : ip.slice(0, idx);
}

function hexPairToIPv4(high, low) {
  const a = parseInt(high, 16);
  const b = parseInt(low, 16);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return [(a >> 8) & 255, a & 255, (b >> 8) & 255, b & 255].join(".");
}

// Unwrap IPv4-mapped and well-known NAT64 addresses so ::ffff:127.0.0.1
// is treated the same as 127.0.0.1.
function embeddedIPv4(ip) {
  const lower = String(ip).toLowerCase();

  const dotted = lower.match(/^(?::ffff:|64:ff9b::)(\d+\.\d+\.\d+\.\d+)$/);
  if (dotted && isIP(dotted[1]) === 4) return dotted[1];

  const mappedHex = lower.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (mappedHex) return hexPairToIPv4(mappedHex[1], mappedHex[2]);

  const nat64Hex = lower.match(/^64:ff9b::([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (nat64Hex) return hexPairToIPv4(nat64Hex[1], nat64Hex[2]);

  return null;
}

function classify(ip, v4List, v6List) {
  if (!ip) return false;
  ip = stripZone(ip);
  const version = isIP(ip);
  if (version === 4) return v4List.check(ip, "ipv4");
  if (version === 6) {
    if (v6List.check(ip, "ipv6")) return true;
    const v4 = embeddedIPv4(ip);
    return v4 ? classify(v4, v4List, v6List) : false;
  }
  return false;
}

function isPrivateIP(ip) {
  return classify(ip, privateV4, privateV6);
}

function isLoopback(ip) {
  return classify(ip, loopbackV4, loopbackV6);
}

module.exports = { isPrivateIP, isLoopback };
