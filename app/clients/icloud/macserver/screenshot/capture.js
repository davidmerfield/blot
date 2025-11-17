const { getBrowser } = require("./browser");
const { getBlocker } = require("./blocker");
const { defaultUserAgent, getAntiDetectionScript } = require("./utils");

const DEFAULT_WIDTH = 1440;
const DEFAULT_HEIGHT = 900;
const MIN_DIMENSION = 100;
const MAX_DIMENSION = 4000;
const DEFAULT_TIMEOUT = 30000;
const MAX_TIMEOUT = 120000;
const MIN_TIMEOUT = 1000;

const clampNumber = (value, min, max, fallback) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }

  return Math.min(Math.max(Math.round(numeric), min), max);
};

const captureScreenshot = async (options) => {
  const browser = getBrowser();
  const blocker = getBlocker();

  const width = clampNumber(options?.width, MIN_DIMENSION, MAX_DIMENSION, DEFAULT_WIDTH);
  const height = clampNumber(options?.height, MIN_DIMENSION, MAX_DIMENSION, DEFAULT_HEIGHT);
  const timeout = clampNumber(options?.timeout, MIN_TIMEOUT, MAX_TIMEOUT, DEFAULT_TIMEOUT);
  const fullPage = Boolean(options?.fullPage);
  const url = options?.url;

  if (!url) {
    throw new Error("A URL is required to capture a screenshot");
  }

  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 2,
    locale: "en-US",
    userAgent: defaultUserAgent,
  });

  let page;
  try {
    page = await context.newPage();

    if (blocker) {
      await blocker.enableBlockingInPage(page);
    }

    await page.addInitScript(getAntiDetectionScript());
    page.setDefaultNavigationTimeout(timeout);
    page.setDefaultTimeout(timeout);

    await page.goto(url, {
      waitUntil: "networkidle",
      timeout,
    });

    const randomDelay = 200 + Math.floor(Math.random() * 300);
    await page.waitForTimeout(randomDelay);

    await page.evaluate(() => {
      window.scrollBy(0, 100);
    });

    const buffer = await page.screenshot({
      fullPage,
      type: "png",
    });

    return buffer;
  } finally {
    if (page) {
      await page.close();
    }
    await context.close();
  }
};

module.exports = {
  captureScreenshot,
};
