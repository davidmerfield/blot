const puppeteer = require("puppeteer");
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
    await initialize();

    page = await browser.newPage();
    await page.setUserAgent(DEFAULT_USER_AGENT);

    const viewport = options.mobile ? VIEWPORT.mobile : VIEWPORT.desktop;
    await page.setViewport({
      width: options.width ?? viewport.width,
      height: options.height ?? viewport.height,
      deviceScaleFactor: 2,
    });

    await fs.ensureDir(dirname(path));

    console.log(prefix(), "Navigating browser to", site);
    await page.goto(site, {
      waitUntil: "networkidle0",
      timeout: PAGE_TIMEOUT,
    });

    console.log(prefix(), "Taking screenshot of", site, "to", path);
    await screenshotWithTimeout(page, path);

  } catch (error) {
    console.error(prefix(), "Error during screenshot:", error);
    await restart();
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