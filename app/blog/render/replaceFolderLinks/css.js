const lookupFile = require('./lookupFile');

const htmlExtRegex = /\.html$/;
const fileExtRegex = /[^/]*\.[^/]*$/;
const urlRegex = /url\(['"]?([^'"())]+)['"]?\)/gi;

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
        const url = match[1];
        
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

    // Replace all URLs with their CDN versions
    return css.replace(urlRegex, (match, url) => {
      const cdnUrl = processedUrls.get(url);
      return cdnUrl ? `url(${cdnUrl})` : match;
    });

  } catch (err) {
    console.warn('URL replacement failed:', err);
    return css;
  }
};