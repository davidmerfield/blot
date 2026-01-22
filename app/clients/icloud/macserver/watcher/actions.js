import clfdate from "../util/clfdate.js";
import { getLimiterForBlogID } from "../limiters.js";
import mkdir from "../httpClient/mkdir.js";
import remove from "../httpClient/remove.js";
import resync from "../httpClient/resync.js";
import upload from "../httpClient/upload.js";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const withRetries = async (label, operation, options = {}) => {
  const { attempts = 4, baseDelayMs = 200 } = options;

  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
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

const performAction = async (blogID, pathInBlogDirectory, action) => {

  const validActions = ['upload', 'remove', 'mkdir'];
  
  if (!validActions.includes(action)) {
    throw new Error(`Invalid action: ${action}. Must be one of: ${validActions.join(', ')}`);
  }

  const limiter = getLimiterForBlogID(blogID);

  await limiter.schedule(async () => {
    try {
      if (action === "upload") {
        await withRetries(
          `upload ${blogID}/${pathInBlogDirectory}`,
          () => upload(blogID, pathInBlogDirectory)
        );
      } else if (action === "remove") {
        await withRetries(
          `remove ${blogID}/${pathInBlogDirectory}`,
          () => remove(blogID, pathInBlogDirectory)
        );
      } else if (action === "mkdir") {
        await withRetries(
          `mkdir ${blogID}/${pathInBlogDirectory}`,
          () => mkdir(blogID, pathInBlogDirectory)
        );
      }
    } catch (error) {
      resync(
        blogID,
        `${action} for ${pathInBlogDirectory} failed after retries`
      ).catch((resyncError) => {
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

export { performAction };
