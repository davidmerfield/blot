// TEMPORARY module, part of the airlock rollout plan (see
// config/airlock/README.md and the `airlockProbe` block in config/index.js).
//
// Runs once, shortly after server boot (see app/setup.js), and just logs
// whether the airlock sidecar is reachable and actually filtering traffic -
// it does NOT change how helper/screenshot or helper/transformer/download
// fetch anything. The point is to get a production signal, across a few
// deploys, that the airlock works before a follow-up PR switches real
// traffic through it.
//
// Delete this file, its call site in app/setup.js, config.airlockProbe, and
// the BLOT_AIRLOCK_PROBE_* env vars together once that follow-up PR lands.

const config = require("config");
const puppeteer = require("puppeteer");
const fs = require("fs-extra");
const fetch = require("node-fetch");
const { HttpProxyAgent } = require("http-proxy-agent");
const { HttpsProxyAgent } = require("https-proxy-agent");
const tempDir = require("helper/tempDir")();
const clfdate = require("helper/clfdate");

const PUBLIC_CHECK_URL = "https://example.com/";
// Deliberately probing the real cloud metadata address, not a private IP
// literal: it's the highest-value target the egress filter has to block,
// and it's routable (as a destination attempt) from any host, cloud or not.
const METADATA_URL = "http://169.254.169.254/latest/meta-data/";
const NAV_TIMEOUT = 10000; // 10s
const FETCH_TIMEOUT = 8000; // 8s
const OVERALL_TIMEOUT = 30000; // 30s per check, in case a step hangs instead of erroring

const prefix = () => `${clfdate()} Airlock probe:`;

function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function probeBrowser(browserUrl) {
  let browser;
  try {
    browser = await puppeteer.connect({ browserURL: browserUrl });
  } catch (error) {
    return { ok: false, step: "connect", error };
  }

  try {
    const context = await browser.createBrowserContext();
    try {
      const page = await context.newPage();

      await page.goto(PUBLIC_CHECK_URL, {
        waitUntil: "domcontentloaded",
        timeout: NAV_TIMEOUT,
      });

      const path = `${tempDir}airlock-probe-${Date.now()}.png`;
      await page.screenshot({ path });
      const { size } = await fs.stat(path);
      await fs.remove(path).catch(() => {});

      if (!size) {
        return { ok: false, step: "screenshot-empty" };
      }

      // Prove the egress filter is actually active, not just that the
      // browser is reachable - a navigation to the metadata address must
      // fail (nft rejects the connection; Chromium reports a nav error).
      let metadataBlocked = false;
      try {
        await page.goto(METADATA_URL, { timeout: NAV_TIMEOUT });
      } catch (error) {
        metadataBlocked = true;
      }

      if (!metadataBlocked) {
        return { ok: false, step: "metadata-not-blocked" };
      }

      return { ok: true, screenshotBytes: size };
    } finally {
      await context.close().catch(() => {});
    }
  } catch (error) {
    return { ok: false, step: "navigate-or-screenshot", error };
  } finally {
    browser.disconnect();
  }
}

async function probeProxy(proxyUrl) {
  const httpAgent = new HttpProxyAgent(proxyUrl);
  const httpsAgent = new HttpsProxyAgent(proxyUrl);
  const agent = (parsedURL) => (parsedURL.protocol === "https:" ? httpsAgent : httpAgent);

  try {
    const res = await fetch(PUBLIC_CHECK_URL, { agent, timeout: FETCH_TIMEOUT });
    if (!res.ok) {
      return { ok: false, step: "public-fetch", status: res.status };
    }
  } catch (error) {
    return { ok: false, step: "public-fetch", error };
  }

  // A blocked destination can surface either as a thrown network error or
  // as tinyproxy's own non-2xx error page - both count as "blocked".
  let metadataBlocked = false;
  try {
    const res = await fetch(METADATA_URL, { agent, timeout: FETCH_TIMEOUT });
    metadataBlocked = !res.ok;
  } catch (error) {
    metadataBlocked = true;
  }

  if (!metadataBlocked) {
    return { ok: false, step: "metadata-not-blocked" };
  }

  return { ok: true };
}

module.exports = async function probeAirlock() {
  const { browserUrl, proxy } = config.airlockProbe || {};

  if (!browserUrl && !proxy) {
    console.log(prefix(), "skipping - BLOT_AIRLOCK_PROBE_* not set");
    return;
  }

  if (browserUrl) {
    try {
      const result = await withTimeout(probeBrowser(browserUrl), OVERALL_TIMEOUT, "Browser check");
      if (result.ok) {
        console.log(
          prefix(),
          `browser check passed (${result.screenshotBytes}-byte screenshot, metadata blocked)`
        );
      } else {
        console.error(prefix(), `browser check FAILED at step "${result.step}"`, result.error || "");
      }
    } catch (error) {
      console.error(prefix(), "browser check FAILED unexpectedly:", error);
    }
  } else {
    console.log(prefix(), "skipping browser check - BLOT_AIRLOCK_PROBE_BROWSER_URL not set");
  }

  if (proxy) {
    try {
      const result = await withTimeout(probeProxy(proxy), OVERALL_TIMEOUT, "Proxy check");
      if (result.ok) {
        console.log(prefix(), "proxy check passed (public fetch OK, metadata blocked)");
      } else {
        console.error(
          prefix(),
          `proxy check FAILED at step "${result.step}"`,
          result.error || result.status || ""
        );
      }
    } catch (error) {
      console.error(prefix(), "proxy check FAILED unexpectedly:", error);
    }
  } else {
    console.log(prefix(), "skipping proxy check - BLOT_AIRLOCK_PROBE_PROXY_URL not set");
  }
};
