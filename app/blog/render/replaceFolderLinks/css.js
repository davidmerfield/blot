const postcss = require("postcss");
const valueParser = require("postcss-value-parser");
const getVersion = require("./getVersion");

const htmlExtRegex = /\.html$/;
const fileExtRegex = /[^/]*\.[^/]*$/;

module.exports = async function replaceCssUrls(cacheID, blogID, css) {
  try {
    const processedUrls = new Map();

    let changes = 0;
    const result = await postcss([
      {
        postcssPlugin: "replace-urls",
        async Once(root) {
          const promises = [];

          root.walkDecls((decl) => {
            if (!/url\(/i.test(decl.value)) return;

            const parsed = valueParser(decl.value);

            parsed.walk((node) => {
              if (
                node.type === "function" &&
                node.value.toLowerCase() === "url"
              ) {
                const url = node.nodes[0]?.value;
                if (!url) return;

                const cleanUrl = url.replace(/['"]/g, "");

                if (cleanUrl.includes("://") || cleanUrl.startsWith("data:")) {
                  return;
                }

                if (
                  htmlExtRegex.test(cleanUrl) ||
                  !fileExtRegex.test(cleanUrl)
                ) {
                  return;
                }

                promises.push(
                  (async () => {
                    const cdnUrl = await getVersion(blogID, cacheID, cleanUrl);
                    processedUrls.set(cleanUrl, cdnUrl);
                  })()
                );
              }
            });
          });

          await Promise.all(promises);

          // Apply all URL replacements after processing
          root.walkDecls((decl) => {
            if (!/url\(/i.test(decl.value)) return;

            const parsed = valueParser(decl.value);

            parsed.walk((node) => {
              if (
                node.type === "function" &&
                node.value.toLowerCase() === "url"
              ) {
                const url = node.nodes[0]?.value;
                if (!url) return;

                const cleanUrl = url.replace(/['"]/g, "");
                const cdnUrl = processedUrls.get(cleanUrl);

                if (cdnUrl && cdnUrl !== "ENOENT") {
                  node.nodes[0].value = cdnUrl;
                  changes++;
                }
              }
            });

            decl.value = parsed.toString();
          });
        },
      },
    ]).process(css, { from: undefined });

    return changes > 0 ? result.css : css;
  } catch (err) {
    console.warn("PostCSS parsing failed:", err);
    return css;
  }
};
