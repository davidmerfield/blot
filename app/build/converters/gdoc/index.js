const fs = require("fs-extra");
const ensure = require("helper/ensure");
const LocalPath = require("helper/localPath");
const extname = require("path").extname;
const cheerio = require("cheerio");
const hash = require("helper/hash");
const fetch = require("node-fetch");
const { join } = require("path");
const config = require("config");
const sharp = require("sharp");
const Metadata = require("build/metadata");
const extend = require("helper/extend");

function is (path) {
  return [".gdoc"].indexOf(extname(path).toLowerCase()) > -1;
}

async function read (blog, path, callback) {
  ensure(blog, "object")
    .and(path, "string")
    .and(callback, "function");

  try {
    const localPath = LocalPath(blog.id, path);
    const blogDir = join(config.blog_static_files_dir, blog.id);
    const assetDir = join(blogDir, "_assets", hash(path));

    const stat = await fs.stat(localPath);

    // Don't try and turn HTML exported from a google doc into posts
    // if it's over 5MB in size
    if (stat && stat.size > 5 * 1000 * 1000)
      return callback(new Error("Google Doc export HTML too big"));

    const contents = await fs.readFile(localPath, "utf-8");

    const $ = cheerio.load(contents, { decodeEntities: false });

    // replaces google docs 'titles' with true h1 tags
    $("p.title").each(function (i, elem) {
      $(this).replaceWith("<h1>" + $(this).html() + "</h1>");
    });

    // replaces google docs 'subtitles' with true h2 tags
    $("p.subtitle").each(function (i, elem) {
      $(this).replaceWith("<h2>" + $(this).html() + "</h2>");
    });

    var metadata = {};

    // restore the original URL of all links and strip Google's nasty tracking
    // redirect e.g. map https://www.google.com/url?q=https://example.com&amp;sa=D&amp;source=editors&amp;ust=1751016887642460&amp;usg=AOvVaw05ZCiUPYVBgPd61MWsgljs -> https://example.com
    $("a").each(function (i, elem) {
      var href = $(this).attr("href");
      // parse the URL to get the original URL and ensure the current url host is 'google.com'
      var url = new URL(href, "https://example.com");
      if (url.hostname === "www.google.com" && url.searchParams.has("q")) {
        var originalUrl = url.searchParams.get("q");
        if (originalUrl) {
          $(this).attr("href", originalUrl);
        }
      }
    });
      
    $("p").each(function (i) {
      var text = $(this).text();

      if (text.indexOf(":") === -1) return false;

      var key = text.slice(0, text.indexOf(":"));

      // Key has space
      if (/\s/.test(key.trim())) return false;

      var parsed = Metadata(text);

      if (parsed.html === text) return false;

      extend(metadata).and(parsed.metadata);

      $(this).remove();
    });

    // replace italic inlines with em
    $('span[style*="font-style:italic"]').each(function (i, elem) {
      $(this).replaceWith("<em>" + $(this).html() + "</em>");
    });

    // replace bold inlines with strong
    $('span[style*="font-weight:700"]').each(function (i, elem) {
      $(this).replaceWith("<strong>" + $(this).html() + "</strong>");
    });

    // remove all inline style attributes
    $("[style]").removeAttr("style");

    const images = [];

    $("img").each(function (i, elem) {
      images.push(elem);
    });

    for (const elem of images) {
      const src = $(elem).attr("src");

      try {
        const res = await fetch(src);
        const disposition = res.headers.get("content-disposition");
        const buffer = await res.buffer();

        let ext;

        try {
          ext = disposition
            .split(";")
            .find(i => i.includes("filename"))
            .split("=")
            .pop()
            .replace(/"/g, "")
            .split(".")
            .pop();
        } catch (err) {}

        if (!ext) {
          // use sharp to determine the image type
          const metadata = await sharp(buffer).metadata();
          ext = metadata.format;
        }

        const filename = hash(src) + "." + ext;
        await fs.outputFile(join(assetDir, filename), buffer);
        $(elem).attr("src", "/_assets/" + hash(path) + "/" + filename);
      } catch (err) {
        console.log(err);
      }
    }

    let html = $("body").html();

    var metadataString = "<!--";

    for (var i in metadata) metadataString += "\n" + i + ": " + metadata[i];

    if (metadataString !== "<!--") {
      metadataString += "\n-->\n";
      html = metadataString + html;
    }

    callback(null, html, stat);
  } catch (err) {
    callback(err);
  }
}

module.exports = { read: read, is: is, id: "gdoc" };
