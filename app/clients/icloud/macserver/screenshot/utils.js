const PRIVATE_IP_REGEX = /^(127\.\d{1,3}\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3})$/;
const LOCALHOSTS = ["localhost", "::1", "0.0.0.0"];

const defaultUserAgent =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 13_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36";

const getBannerHidingCSS = () => `
  [id*="cookie" i],
  [class*="cookie" i],
  [id*="consent" i],
  [class*="consent" i],
  .announcement,
  .modal-backdrop,
  .newsletter,
  .privacy-banner,
  .tracking-consent,
  .gdpr,
  .Toast,
  .toast,
  .popup,
  .modal,
  .overlay {
    display: none !important;
    visibility: hidden !important;
    opacity: 0 !important;
  }
`;

const getAntiDetectionScript = () => `
  Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  Object.defineProperty(navigator, 'platform', { get: () => 'MacIntel' });
  Object.defineProperty(navigator, 'vendor', { get: () => 'Apple Computer, Inc.' });
  Object.defineProperty(navigator, 'language', { get: () => 'en-US' });
  Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
  Object.defineProperty(navigator, 'deviceMemory', { get: () => 8 });
  Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 8 });

  window.chrome = window.chrome || { runtime: {} };
  Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
  Object.defineProperty(navigator, 'permissions', {
    get: () => ({
      query: ({ name }) => {
        if (name === 'notifications') {
          return Promise.resolve({ state: 'denied' });
        }
        return Promise.resolve({ state: 'prompt' });
      },
    }),
  });

  const style = document.createElement('style');
  style.textContent = ${JSON.stringify(getBannerHidingCSS())};
  document.documentElement.appendChild(style);
`;

const createUrlError = (message) => {
  const error = new Error(message);
  error.code = "INVALID_URL";
  return error;
};

const validateUrl = (input) => {
  if (!input || typeof input !== "string") {
    throw createUrlError("Invalid URL provided");
  }

  let parsed;
  try {
    parsed = new URL(input);
  } catch (error) {
    throw createUrlError("Invalid URL provided");
  }

  const protocol = parsed.protocol.toLowerCase();
  if (protocol !== "http:" && protocol !== "https:") {
    throw createUrlError("URL must use http or https");
  }

  const hostname = parsed.hostname.toLowerCase();
  if (LOCALHOSTS.includes(hostname) || PRIVATE_IP_REGEX.test(hostname)) {
    throw createUrlError("URL points to a disallowed host");
  }

  return parsed.toString();
};

module.exports = {
  defaultUserAgent,
  getAntiDetectionScript,
  getBannerHidingCSS,
  validateUrl,
};
