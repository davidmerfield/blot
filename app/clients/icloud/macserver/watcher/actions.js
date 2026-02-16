import clfdate from "../util/clfdate.js";
import { getLimiterForBlogID } from "../limiters.js";
import mkdir from "../httpClient/mkdir.js";
import remove from "../httpClient/remove.js";
import resync from "../httpClient/resync.js";
import upload, { OVERSIZE_FILE_ERROR_CODE } from "../httpClient/upload.js";

const OVERSIZE_IGNORE_TTL_MS = 60 * 1000;
const oversizeIgnoreCache = new Map();

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const isNonRetriableOversizeError = (error) =>
  error && (error.code === OVERSIZE_FILE_ERROR_CODE || error.name === "OversizeFileError");

const getOversizeCacheKey = (blogID, pathInBlogDirectory) =>
  `${blogID}:${pathInBlogDirectory}`;

const isOversizeFileIgnored = (blogID, pathInBlogDirectory, now = Date.now()) => {
  const cacheKey = getOversizeCacheKey(blogID, pathInBlogDirectory);
  const until = oversizeIgnoreCache.get(cacheKey);

  if (!until) {
    return false;
  }

  if (until <= now) {
    oversizeIgnoreCache.delete(cacheKey);
    return false;
  }

  return true;
};

const rememberOversizeFile = (blogID, pathInBlogDirectory, now = Date.now()) => {
  const cacheKey = getOversizeCacheKey(blogID, pathInBlogDirectory);
  oversizeIgnoreCache.set(cacheKey, now + OVERSIZE_IGNORE_TTL_MS);
};

const withRetries = async (label, operation, options = {}) => {
  const { attempts = 4, baseDelayMs = 200 } = options;

  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      if (isNonRetriableOversizeError(error)) {
        console.warn(
          clfdate(),
          `${label} intentionally skipped: file exceeds configured upload size limit.`,
          {
            code: error.code,
            path: error.relativePath,
            size: error.size,
            maxFileSize: error.maxFileSize,
          }
        );
        throw error;
      }

      if (attempt === attempts) {
        break;
      }
      const delayMs = baseDelayMs * 2 ** (attempt - 1);
      console.warn(
        clfdate(),
        `${label} failed on attempt ${attempt}/${attempts}, retrying in ${delayMs}ms:`,
        error
      );
      await sleep(delayMs);
    }
  }

  console.error(clfdate(), `${label} failed after ${attempts} attempts:`, lastError);
  throw lastError;
};

const performAction = async (
  blogID,
  pathInBlogDirectory,
  action,
  dependencies = { upload, remove, mkdir, resync }
) => {
  const validActions = ["upload", "remove", "mkdir"];

  if (!validActions.includes(action)) {
    throw new Error(
      `Invalid action: ${action}. Must be one of: ${validActions.join(", ")}`
    );
  }

  if (action === "upload" && isOversizeFileIgnored(blogID, pathInBlogDirectory)) {
    console.warn(
      clfdate(),
      `Skipping upload for ${blogID}/${pathInBlogDirectory}: oversized file is in cooldown window.`
    );
    return;
  }

  const limiter = getLimiterForBlogID(blogID);

  await limiter.schedule(async () => {
    try {
      if (action === "upload") {
        await withRetries(`upload ${blogID}/${pathInBlogDirectory}`, () =>
          dependencies.upload(blogID, pathInBlogDirectory)
        );
      } else if (action === "remove") {
        await withRetries(`remove ${blogID}/${pathInBlogDirectory}`, () =>
          dependencies.remove(blogID, pathInBlogDirectory)
        );
      } else if (action === "mkdir") {
        await withRetries(`mkdir ${blogID}/${pathInBlogDirectory}`, () =>
          dependencies.mkdir(blogID, pathInBlogDirectory)
        );
      }
    } catch (error) {
      if (action === "upload" && isNonRetriableOversizeError(error)) {
        rememberOversizeFile(blogID, pathInBlogDirectory);
        return;
      }

      dependencies
        .resync(blogID, `${action} for ${pathInBlogDirectory} failed after retries`)
        .catch((resyncError) => {
          console.error(
            clfdate(),
            `Unexpected error requesting resync for blogID: ${blogID}`,
            resyncError
          );
        });
      throw error;
    }
  });
};

const clearOversizeIgnoreCache = () => oversizeIgnoreCache.clear();

export { performAction, withRetries, clearOversizeIgnoreCache };
