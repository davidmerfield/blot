const { PlaywrightBlocker } = require("@cliqz/adblocker-playwright");
const fetch = require("cross-fetch");

let blocker;
let refreshTimer;

const loadBlocker = async () => {
  blocker = await PlaywrightBlocker.fromPrebuiltAdsAndTracking(fetch);
  return blocker;
};

const scheduleRefresh = () => {
  if (refreshTimer) {
    clearInterval(refreshTimer);
  }

  refreshTimer = setInterval(async () => {
    try {
      await loadBlocker();
    } catch (error) {
      console.error("Failed to refresh adblocker filters:", error);
    }
  }, 24 * 60 * 60 * 1000);
};

const initializeBlocker = async () => {
  try {
    await loadBlocker();
    scheduleRefresh();
  } catch (error) {
    console.error("Failed to initialize adblocker:", error);
    blocker = null;
  }
};

const getBlocker = () => blocker;

module.exports = {
  getBlocker,
  initializeBlocker,
};
