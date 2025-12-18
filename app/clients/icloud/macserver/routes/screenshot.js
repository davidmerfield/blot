const { captureScreenshot } = require("../screenshot/capture");
const { domainLimiter, globalLimiter } = require("../screenshot/limiters");
const { validateUrl } = require("../screenshot/utils");

const clampDimension = (value, fallback) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }

  const bounded = Math.min(Math.max(Math.round(numeric), 100), 4000);
  return bounded;
};

const clampTimeout = (value, fallback) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }

  return Math.min(Math.max(Math.round(numeric), 1000), 120000);
};

module.exports = async (req, res) => {
  try {
    const { url, width, height, fullPage, timeout } = req.body || {};
    const normalizedUrl = validateUrl(url);
    const viewportWidth = clampDimension(width, undefined);
    const viewportHeight = clampDimension(height, undefined);
    const navigationTimeout = clampTimeout(timeout, undefined);
    const hostname = new URL(normalizedUrl).hostname;

    const captureTask = async () =>
      captureScreenshot({
        url: normalizedUrl,
        width: viewportWidth,
        height: viewportHeight,
        fullPage: Boolean(fullPage),
        timeout: navigationTimeout,
      });

    const runWithDomainLimiter = () =>
      domainLimiter.key(hostname).schedule(captureTask);

    const buffer = await globalLimiter.schedule(runWithDomainLimiter);

    res.setHeader("Content-Type", "image/png");
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.send(buffer);
  } catch (error) {
    if (error.code === "INVALID_URL") {
      return res.status(400).json({
        error: "invalid_url",
        message: error.message,
      });
    }

    console.error("Failed to capture screenshot:", error);
    res.status(500).json({
      error: "capture_failed",
      message: error.message,
    });
  }
};
