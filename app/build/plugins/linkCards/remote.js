const fetch = require("node-fetch");

const { REQUEST_TIMEOUT } = require("./constants");
const { transformerLookup } = require("./transformers");
const { createHTMLTransform, extractMetadataFromHTML } = require("./metadata");

async function fetchMetadata(href, transformer) {
  const fallback = () => fetchMetadataDirect(href);

  if (!transformer) {
    return fallback();
  }

  return transformerLookup(transformer, href, createHTMLTransform(href), fallback);
}

async function fetchMetadataDirect(href) {
  try {
    const response = await fetch(href, {
      redirect: "follow",
      timeout: REQUEST_TIMEOUT,
      headers: {
        "user-agent": "Blot Link Cards (+https://blot.im)",
      },
    });

    if (!response.ok) return null;

    const html = await response.text();
    return extractMetadataFromHTML(html, href);
  } catch (err) {
    return null;
  }
}

module.exports = {
  fetchMetadata,
  fetchMetadataDirect,
};
