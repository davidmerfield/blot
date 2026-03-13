const key = require("./key");
const client = require("models/client");
const { promisify } = require("util");
const hgetall = promisify(client.hgetall).bind(client);
const get = promisify(client.get).bind(client);
const debug = require("debug")("blot:template:getViewByURLPattern");
const { match } = require("path-to-regexp");
const { parse } = require("url");
const urlNormalizer = require("helper/urlNormalizer");

/**
 * Get a view by matching its URL pattern.
 *
 * @param {string} templateID - The ID of the template.
 * @param {string} url - The URL to match.
 * @param {function} callback - Callback function (err, viewName, params, query).
 */
module.exports = async function getViewByURLPattern(templateID, url, callback) {
  debug("Looking up views for templateID:", templateID, "URL:", url);

  if (!templateID || typeof templateID !== "string") {
    const err = new Error("Invalid templateID");
    debug(err.message);
    return callback(err);
  }

  if (!url || typeof url !== "string") {
    const err = new Error("Invalid URL");
    debug(err.message);
    return callback(err);
  }

  try {
    const { pathname, query } = parse(url, true); // `true` parses query string into an object
    const normalizedPathname = normalizePathname(pathname);

    debug("Normalized URL:", normalizedPathname);

    // Fetch all views and their patterns for the given template ID
    const viewPatternStrings = await hgetall(key.urlPatterns(templateID));

    if (viewPatternStrings) {
      const views = parseViewPatterns(viewPatternStrings);

      // Iterate through views and match the URL
      for (const [viewName, urlPatterns] of views) {
        for (const rawPattern of urlPatterns) {
          try {
            const matchResult = safeMatch(rawPattern, normalizedPathname);

            if (matchResult) {
              debug(
                "Matched pattern:",
                rawPattern,
                "with normalized URL:",
                normalizedPathname,
                "in view:",
                viewName
              );
              return callback(null, viewName, matchResult.params, query);
            }
          } catch (err) {
            debug("Error while matching pattern:", rawPattern, err);
            // Continue to the next pattern without failing completely
          }
        }
      }

      debug("No matching URL pattern found for URL:", url);
    } else {
      debug("No URL patterns found for templateID:", templateID);
    }

    // Fall back to matching the URL directly
    const viewName = await get(key.url(templateID, urlNormalizer(url)));

    if (viewName) {
      debug("Found view by URL:", viewName);
      return callback(null, viewName, null, query);
    }

    debug("No view found for URL:", url);
    return callback(null, null, null, null);
  } catch (error) {
    debug("Error while processing URL:", error);
    return callback(error, null, null, null);
  }
};

/**
 * Normalize a pathname by adding a leading slash, removing trailing slashes, and converting to lowercase.
 *
 * @param {string} pathname - The pathname to normalize.
 * @returns {string} - The normalized pathname.
 */
function normalizePathname(pathname) {
  if (!pathname || typeof pathname !== "string") {
    return "/";
  }
  return `/${pathname.replace(/^\/+/, "").replace(/\/+$/, "").toLowerCase()}`;
}

/**
 * Parse view patterns from Redis hash object.
 *
 * @param {object} viewPatternStrings - The Redis hash object with view patterns.
 * @returns {Array} - An array of [viewName, urlPatterns].
 */
function parseViewPatterns(viewPatternStrings) {
  return Object.entries(viewPatternStrings).map(([viewName, patterns]) => [
    viewName,
    JSON.parse(patterns), // Patterns are stored as JSON strings
  ]).sort(([viewNameA], [viewNameB]) =>
    viewNameA.localeCompare(viewNameB)
  );
}

/**
 * Safely match a URL against a pattern.
 *
 * @param {string} rawPattern - The raw URL pattern to match.
 * @param {string} normalizedPathname - The normalized URL pathname.
 * @returns {object|null} - The match result or null if no match.
 */
function safeMatch(rawPattern, normalizedPathname) {
  const normalizedPattern = normalizePathname(rawPattern);

  // Use path-to-regexp to create a matching function
  const matchPattern = match(normalizedPattern, { decode: false });

  return matchPattern(normalizedPathname);
}