const puppeteer = require("puppeteer");
const dns = require("dns").promises;
const net = require("net");
const { dirname } = require("path");
const fs = require("fs-extra");
const Bottleneck = require("bottleneck");
const retry = require("./retry");
const clfdate = require("helper/clfdate");

const prefix = () => `${clfdate()} Screenshot:`;

// CONSTANTS
const CONCURRENT_SCREENSHOTS = 1;
const MIN_TIME_BETWEEN_OPS = 2000; // 2 seconds
const DEFAULT_RESTART_INTERVAL = 1000 * 60 * 60; // 1 hour
const PAGE_TIMEOUT = 20000;
const CLOSE_PAGE_TIMEOUT = 2000;
const SCREENSHOT_TIMEOUT = 2000;
const BROWSER_ARGS = require("./args");

const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36";

const VIEWPORT = {
  desktop: { width: 1260, height: 778 },
  mobile: { width: 400, height: 650 },
};

const IPV4_BLOCKS = [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10],
  ["127.0.0.0", 8], ["169.254.0.0", 16], ["172.16.0.0", 12],
  ["192.0.0.0", 24], ["192.0.2.0", 24], ["192.31.196.0", 24],
  ["192.52.193.0", 24], ["192.88.99.0", 24], ["192.168.0.0", 16],
  ["192.175.48.0", 24], ["198.18.0.0", 15], ["198.51.100.0", 24],
  ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4],
];

const IPV6_BLOCKS = [
  ["::", 128], ["::1", 128], ["64:ff9b:1::", 48], ["100::", 64],
  ["2001:2::", 48], ["2001:10::", 28], ["2001:20::", 28], ["2001:db8::", 32],
  ["3fff::", 20], ["5f00::", 16], ["fc00::", 7], ["fe80::", 10],
  ["fec0::", 10], ["ff00::", 8],
];

function ipv4Number(address) {
  return address.split(".").reduce((value, part) => value * 256 + Number(part), 0) >>> 0;
}

function ipv6Number(address) {
  if (address.includes(".")) {
    const lastColon = address.lastIndexOf(":");
    const ipv4 = ipv4Number(address.slice(lastColon + 1));
    address = `${address.slice(0, lastColon)}:${(ipv4 >>> 16).toString(16)}:${(ipv4 & 0xffff).toString(16)}`;
  }
  const halves = address.toLowerCase().split("::");
  const parse = (half) => half ? half.split(":").map((part) => parseInt(part, 16)) : [];
  const left = parse(halves[0]);
  const right = parse(halves[1]);
  const words = halves.length === 1 ? left : [...left, ...Array(8 - left.length - right.length).fill(0), ...right];
  return words.reduce((value, word) => (value << 16n) + BigInt(word), 0n);
}

function inBlock(value, base, prefix, bits) {
  const shift = BigInt(bits - prefix);
  return (value >> shift) === (base >> shift);
}

function isPublicAddress(address) {
  const family = net.isIP(address);
  if (family === 4) {
    const value = BigInt(ipv4Number(address));
    return !IPV4_BLOCKS.some(([base, prefix]) => inBlock(value, BigInt(ipv4Number(base)), prefix, 32));
  }
  if (family !== 6) return false;

  const value = ipv6Number(address);
  // IPv4-mapped IPv6 addresses must be judged by their embedded IPv4 address.
  if (inBlock(value, ipv6Number("::ffff:0:0"), 96, 128)) {
    return isPublicAddress([
      Number((value >> 24n) & 255n), Number((value >> 16n) & 255n),
      Number((value >> 8n) & 255n), Number(value & 255n),
    ].join("."));
  }
  return !IPV6_BLOCKS.some(([base, prefix]) => inBlock(value, ipv6Number(base), prefix, 128));
}

function parseWebUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch (_) {
    throw new Error("Screenshot URL is invalid");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`Screenshot URL protocol is not allowed: ${url.protocol}`);
  }
  return url;
}

async function validateDestination(value, resolutionCache = new Map(), lookup = dns.lookup) {
  const url = parseWebUrl(value);
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  let addresses;
  if (net.isIP(hostname)) {
    addresses = [hostname];
  } else {
    try {
      addresses = (await lookup(hostname, { all: true, verbatim: true })).map(({ address }) => address);
    } catch (error) {
      throw new Error(`Could not resolve screenshot hostname: ${hostname}`);
    }
  }
  if (!addresses.length || addresses.some((address) => !isPublicAddress(address))) {
    throw new Error(`Screenshot destination is not public: ${hostname}`);
  }

  const signature = [...new Set(addresses)].sort().join(",");
  if (resolutionCache.has(hostname) && resolutionCache.get(hostname) !== signature) {
    throw new Error(`Screenshot hostname changed address during navigation: ${hostname}`);
  }
  resolutionCache.set(hostname, signature);
  return url;
}

async function protectRequests(page, lookup = dns.lookup, resolutions = new Map()) {
  let blockedError = null;
  await page.setRequestInterception(true);
  page.on("request", async (request) => {
    try {
      await validateDestination(request.url(), resolutions, lookup);
      await request.continue();
    } catch (error) {
      blockedError = blockedError || error;
      await request.abort("blockedbyclient");
    }
  });
  return {
    validate: (value) => validateDestination(value, resolutions, lookup),
    blockedError: () => blockedError,
  };
}

// State
let browser = null;
let lastRestartTime = Date.now();
let isRestarting = false;
let browserInitializationPromise = null;

const limiter = new Bottleneck({
  maxConcurrent: CONCURRENT_SCREENSHOTS,
  minTime: MIN_TIME_BETWEEN_OPS,
});

function validateOptions(options) {
  const validatedOptions = { ...options };
  if (options.width && typeof options.width !== 'number') {
    throw new Error('Width must be a number');
  }
  if (options.height && typeof options.height !== 'number') {
    throw new Error('Height must be a number');
  }
  return validatedOptions;
}

async function initialize() {
  if (!browserInitializationPromise) {
    browserInitializationPromise = (async () => {
      try {
        if (!browser) {
          browser = await puppeteer.launch({
            headless: "new",
            devtools: false,
            args: BROWSER_ARGS,
            ignoreDefaultArgs: ["--disable-extensions"],
          });
          const page = await browser.newPage();
          await page.goto("about:blank");
        }
      } catch (error) {
        browserInitializationPromise = null;
        throw error;
      }
    })();
  }
  return browserInitializationPromise;
}

async function restart() {
  console.log(prefix(), "Attempting browser restart");

  if (isRestarting) {
    console.log(prefix(), "Already restarting, skipping");
    return;
  }

  isRestarting = true;
  browserInitializationPromise = null;

  try {
    console.log(prefix(), "Closing browser");
    await cleanup();

    console.log(prefix(), "Browser closed, restarting now");
    await initialize();

    console.log(prefix(), "Browser restarted successfully");
    lastRestartTime = Date.now();
  } catch (error) {
    console.error(prefix(), "Error during restart:", error);
    throw error;
  } finally {
    isRestarting = false;
  }
}

async function cleanup() {
  if (browser) {
    try {
      const pages = await browser.pages();
      await Promise.all(pages.map(page => closePageWithTimeout(page).catch(() => {})));
      await browser.close().catch(() => {});
    } catch (error) {
      console.error(prefix(), "Error during cleanup:", error);
    } finally {
      browser = null;
    }
  }
}

async function closePageWithTimeout(page) {
  try {
    await Promise.race([
      page.close(),
      new Promise((_, reject) =>
        setTimeout(
          () => reject(new Error("Timeout calling page.close() after 2 seconds")),
          CLOSE_PAGE_TIMEOUT
        )
      ),
    ]);
  } catch (error) {
    console.error(prefix(), "Error closing page:", error);
    // Attempt forced cleanup
    try {
      await page.evaluate(() => window.stop());
      await page.close();
    } catch (e) {
      console.error(prefix(), "Failed forced page cleanup:", e);
    }
  }
}

async function screenshotWithTimeout(page, path) {
  try {
    await Promise.race([
      page.screenshot({
        path,
        type: "png",
        omitBackground: true,
      }),
      new Promise((_, reject) =>
        setTimeout(
          () => reject(new Error("Timeout calling page.screenshot() after 2 seconds")),
          SCREENSHOT_TIMEOUT
        )
      ),
    ]);
  } catch (error) {
    // Cleanup partial screenshot file
    try {
      await fs.remove(path);
    } catch (e) {
      console.error(prefix(), "Error cleaning up partial screenshot:", e);
    }
    throw new Error(`Failed to take screenshot: ${error.message}`);
  }
}

async function takeScreenshot(site, path, options = {}) {
  let page = null;
  try {
    options = validateOptions(options);
    // Validate before starting Chromium or creating the destination directory.
    const resolutions = new Map();
    await validateDestination(site, resolutions);
    await initialize();

    page = await browser.newPage();
    await page.setUserAgent(DEFAULT_USER_AGENT);
    const protection = await protectRequests(page, dns.lookup, resolutions);

    const viewport = options.mobile ? VIEWPORT.mobile : VIEWPORT.desktop;
    await page.setViewport({
      width: options.width ?? viewport.width,
      height: options.height ?? viewport.height,
      deviceScaleFactor: 2,
    });

    await fs.ensureDir(dirname(path));

    console.log(prefix(), "Navigating browser to", site);
    try {
      await protection.validate(site);
      await page.goto(site, {
        waitUntil: "networkidle0",
        timeout: PAGE_TIMEOUT,
      });
    } catch (error) {
      throw protection.blockedError() || error;
    }

    if (protection.blockedError()) throw protection.blockedError();

    console.log(prefix(), "Taking screenshot of", site, "to", path);
    await screenshotWithTimeout(page, path);

  } catch (error) {
    console.error(prefix(), "Error during screenshot:", error);
    await fs.remove(path).catch(() => {});
    if (page) await restart();
    throw error;
  } finally {
    if (page) {
      console.log(prefix(), "closing page");
      await closePageWithTimeout(page);
    }

    // Check if restart is needed after the screenshot is complete
    if (Date.now() - lastRestartTime >= DEFAULT_RESTART_INTERVAL) {
      await restart();
    }
  }
}

// Shutdown handler
async function shutdown() {
  await limiter.stop();
  await cleanup();
}

// Export main function
const screenshot = async (site, path, options = {}) => {
  try {
    return await retry(() =>
      limiter.schedule(() => takeScreenshot(site, path, options))
    );
  } catch (error) {
    console.error(prefix(), "Screenshot failed after retries:", error);
    throw error;
  }
};

module.exports = screenshot;
module.exports.restart = restart;
module.exports.shutdown = shutdown;
module.exports._security = { isPublicAddress, parseWebUrl, validateDestination, protectRequests };
