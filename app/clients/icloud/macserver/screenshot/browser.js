const { chromium } = require("playwright");
const { defaultUserAgent } = require("./utils");

let browser;
let hasRegisteredShutdownHandlers = false;

const initializeBrowser = async () => {
  if (browser) {
    return browser;
  }

  browser = await chromium.launch({
    headless: true,
    args: [
      "--disable-dev-shm-usage",
      "--disable-features=IsolateOrigins,site-per-process",
      "--disable-blink-features=AutomationControlled",
    ],
    chromiumSandbox: false,
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
    userAgent: defaultUserAgent,
  });
  await context.close();

  if (!hasRegisteredShutdownHandlers) {
    hasRegisteredShutdownHandlers = true;
    const shutdown = async () => {
      if (browser) {
        await browser.close();
      }
      process.exit(0);
    };

    process.on("SIGTERM", shutdown);
    process.on("SIGINT", shutdown);
  }

  return browser;
};

const getBrowser = () => {
  if (!browser) {
    throw new Error("Browser has not been initialized");
  }

  return browser;
};

const isBrowserHealthy = () => Boolean(browser && browser.isConnected());

module.exports = {
  getBrowser,
  initializeBrowser,
  isBrowserHealthy,
};
