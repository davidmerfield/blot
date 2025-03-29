const lookupFile = require('./lookupFile');

const htmlExtRegex = /\.html$/;
const fileExtRegex = /[^/]*\.[^/]*$/;
// Strict regex that requires matching quotes and parentheses
const urlRegex = /url\((?:([^'"()]+)|['"]([^'"]+)['"]) *\)/gi;

module.exports = async function replaceCssUrls(cacheID, blogID, css) {
  try {
    const processedUrls = new Map();
    const urlMatches = [...css.matchAll(urlRegex)];
    
    // Skip if no URLs found
    if (!urlMatches.length) {
      return css;
    }

    // Process all URLs in parallel
    await Promise.all(
      urlMatches.map(async (match) => {
        // Use the unquoted or quoted URL, whichever is present
        const url = match[1] || match[2];
        
        // Skip URLs that we don't want to process
        if (url.includes('://') || 
            url.startsWith('data:') ||
            htmlExtRegex.test(url) || 
            !fileExtRegex.test(url)) {
          return;
        }

        const cdnUrl = await lookupFile(blogID, cacheID, url);
        if (cdnUrl && cdnUrl !== 'ENOENT') {
          processedUrls.set(url, cdnUrl);
        }
      })
    );

    // Skip if no URLs were processed
    if (!processedUrls.size) {
      return css;
    }

    // Replace only valid URLs
    return css.replace(urlRegex, (match, unquotedUrl, quotedUrl) => {
      const url = unquotedUrl || quotedUrl;
      const cdnUrl = processedUrls.get(url);
      return cdnUrl ? `url(${cdnUrl})` : match;
    });

  } catch (err) {
    console.warn('URL replacement failed:', err);
    return css;
  }
};