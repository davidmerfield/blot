const parse5 = require("parse5");

const htmlExtRegex = /\.html$/;
const fileExtRegex = /[^/]*\.[^/]*$/;

const lookupFile = require("./lookupFile");
const config = require("config");

module.exports = async function replaceFolderLinks(blog, html, log = () => {}) {
  try {
    const blogID = blog.id;
    const cacheID = blog.cacheID;
    const hosts = [blog.handle + "." + config.host, 'www.' + blog.handle + "." + config.host];

    if (blog.domain) {
      hosts.push(blog.domain);
      if (blog.domain.startsWith("www.")) {
        hosts.push(blog.domain.slice(4));
      } else {
        hosts.push("www." + blog.domain);
      }
    }

    // Create regex patterns for each host
    const hostPatterns = hosts.map(host => new RegExp(`^(?:https?:)?//${host}`));

    const document = parse5.parse(html);
    const elements = [];
    const promises = [];
    const stack = [...document.childNodes];
    let changes = 0;

    while (stack.length > 0) {
      const node = stack.pop();

      if (node.attrs) {
        let hasMatchingAttr = false;
        for (let i = 0; i < node.attrs.length; i++) {
          const attr = node.attrs[i];
          if (attr.name === "href" || attr.name === "src") {
            // Check if URL is relative or matches any of the host patterns
            const isRelative = attr.value.indexOf("://") === -1;
            const matchesHost = hostPatterns.some(pattern => pattern.test(attr.value));
            
            if (isRelative || matchesHost) {
              hasMatchingAttr = true;
              break;
            }
          }
        }
        if (hasMatchingAttr) elements.push(node);
      }

      if (node.childNodes) {
        stack.push(...node.childNodes);
      }
    }

    for (const node of elements) {
      for (const attr of node.attrs) {
        if (attr.name === "href" || attr.name === "src") {
          let value = attr.value;
          
          // Remove host if it matches any of the patterns
          hostPatterns.forEach(pattern => {
            value = value.replace(pattern, '');
          });

          // Only process if it's not an HTML file and has a file extension
          if (!htmlExtRegex.test(value) && fileExtRegex.test(value)) {
            promises.push(
              (async () => {
                const result = await lookupFile(blogID, cacheID, value);

                if (result === "ENOENT") {
                  log(`No file found in folder: ${value}`);
                  return;
                }

                log(`Replacing ${attr.value} with ${result}`);
                attr.value = result;
                changes++;
              })()
            );
          }
        }
      }
    }

    await Promise.all(promises);
    return changes ? parse5.serialize(document) : html;
  } catch (err) {
    console.warn("Parse5 parsing failed:", err);
    return html;
  }
};