const { URL } = require("url");

// Define a list of common image extensions
const imageExtensions = [
  ".jpg",
  ".jpeg",
  ".png",
  ".gif",
  ".bmp",
  ".webp",
  ".svg",
];

function render($, callback) {
  $("a").each(function () {
    try {
      const href = $(this).attr("href");
      const text = $(this).text();
      const isImage = IsImage(href);

      if (href && isImage && href === text) {
        $(this).replaceWith(template(href));
      }
    } catch (e) {}
  });

  callback();
}

function template(url) {
  return '<img src="' + url + '" />';
}

function IsImage(url) {
  if (!url) return false;

  try {
    // Parse the URL using the Node.js URL library
    const parsedURL = new URL(url, "http://example.com"); // Use a base URL for relative URLs

    // Check if the protocol is valid (http or https)
    const validProtocols = ["http:", "https:"];
    if (!validProtocols.includes(parsedURL.protocol)) {
      return false;
    }

    // Extract the file extension from the pathname
    const pathname = parsedURL.pathname.toLowerCase();
    return imageExtensions.some((ext) => pathname.endsWith(ext));
  } catch (e) {
    // If URL parsing fails, return false
    return false;
  }
}

module.exports = {
  render: render,
  category: "embeds",
  title: "Images",
  description: "Embed images from image links",
};
