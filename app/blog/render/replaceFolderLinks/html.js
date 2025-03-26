const parse5 = require("parse5");

const htmlExtRegex = /\.html$/;
const fileExtRegex = /[^/]*\.[^/]*$/;

const getVersion = require("./getVersion");

module.exports = async function replaceFolderLinks(cacheID, blogID, html) {
  try {
    // Changed from parseFragment to parse for full HTML document
    const document = parse5.parse(html);

    const elements = [];
    const promises = [];

    // Start with document.childNodes instead of the document itself
    const stack = [...document.childNodes];

    let changes = 0;

    while (stack.length > 0) {
      const node = stack.pop();

      if (node.attrs) {
        let hasMatchingAttr = false;
        for (let i = 0; i < node.attrs.length; i++) {
          const attr = node.attrs[i];
          if (
            (attr.name === "href" || attr.name === "src") &&
            attr.value.indexOf("://") === -1
          ) {
            hasMatchingAttr = true;
            break;
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
        if (
          (attr.name === "href" || attr.name === "src") &&
          attr.value.indexOf("://") === -1 &&
          !htmlExtRegex.test(attr.value) &&
          fileExtRegex.test(attr.value)
        ) {
          promises.push(
            (async () => {
              const result = await getVersion(blogID, cacheID, attr.value);

              if (result === "ENOENT") {
                console.log(`File not found: ${attr.value}`);
                return;
              }

              console.log(`Replacing ${attr.value} with ${result}`);
              attr.value = result;
              changes++;
            })()
          );
        }
      }
    }

    await Promise.all(promises);
    // Use serialize on the full document
    return changes ? parse5.serialize(document) : html;
  } catch (err) {
    console.warn("Parse5 parsing failed:", err);
    return html;
  }
};
