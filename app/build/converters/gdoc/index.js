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
const yaml = require("yaml");

function is(path) {
  return [".gdoc"].indexOf(extname(path).toLowerCase()) > -1;
}

async function read(blog, path, callback) {
  ensure(blog, "object").and(path, "string").and(callback, "function");

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

    let yamlOpeningTag;

    // parse metadata from paragraphs
    $("p").each(function (i) {
      var text = $(this).text();

      // If the first paragraph is a YAML front matter opening tag
      // then we should remove it if and only if the next paragraph
      // contains a valid YAML key-value pair.
      if ((text.trim() === "---" || text.trim() === "—") && i === 0) {
        yamlOpeningTag = $(this);
        return;
      }

      if (
        Object.keys(metadata).length > 0 &&
        (text.trim() === "---" || text.trim() === "—")
      ) {
        // this is a closing tag, so we should stop parsing metadata
        $(this).remove();
        return false;
      }

      if (text.indexOf(":") === -1) return false;

      var key = text.slice(0, text.indexOf(":"));

      // Key has space
      if (/\s/.test(key.trim())) return false;

      var parsed = Metadata(text);

      if (parsed.html === text) return false;

      extend(metadata).and(parsed.metadata);

      // Since we have a valid YAML front matter opening tag,
      // we should also check for a closing tag.
      if (yamlOpeningTag && i === 1) {
        yamlOpeningTag.remove();
        validYAML = true;
      }

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

    // Sort out line breaks
    // Google Docs uses empty <p> tags to represent line breaks
    // We want to convert these into <br> tags instead
    // But we also want to preserve multiple line breaks in a row
    // So we need to group consecutive <p> tags together and then
    // join them with <br> tags
    // Step 1: Collect all <p> nodes in order
    // Step 1: Collect all <p> nodes in order
    // Instead of just pNodes, grab all <p> and <hr> in order:
    const nodes = $("p, hr").toArray();

    let currGroup = [];
    let prevNode = null;
    let emptyCount = 0;

    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      const tag = node.tagName ? node.tagName.toLowerCase() : node.name;

      if (tag === "p") {
        const inner = $(node).html().trim();

        // Is this an empty line?
        if (
          inner === "" ||
          inner === "<span></span>" ||
          inner === "<span/>" ||
          inner.match(/^<span>\s*<\/span>$/)
        ) {
          emptyCount++;
          // Always remove the empty <p>
          $(node).remove();

          // If we have a current group, close it
          if (currGroup.length > 0) {
            const firstP = currGroup[0];
            const lines = currGroup.map((n) => $(n).html().trim());
            $(firstP).html(lines.join("<br>"));
            for (let j = 1; j < currGroup.length; j++) {
              $(currGroup[j]).remove();
            }
            prevNode = firstP;
            currGroup = [];
          }
        } else {
          // Before starting a new group, insert <br> for extra empty lines (if any)
          if (
            emptyCount > 1 &&
            prevNode &&
            prevNode.tagName !== "HR" &&
            prevNode.name !== "hr"
          ) {
            for (let k = 1; k < emptyCount; k++) {
              $(prevNode).after("<br>");
              prevNode = $(prevNode).next()[0];
            }
          }
          emptyCount = 0; // Reset empty count

          currGroup.push(node);
          prevNode = node;
        }
      } else if (tag === "hr") {
        // If we have a current group, close it (no <br> before <hr>)
        if (currGroup.length > 0) {
          const firstP = currGroup[0];
          const lines = currGroup.map((n) => $(n).html().trim());
          $(firstP).html(lines.join("<br>"));
          for (let j = 1; j < currGroup.length; j++) {
            $(currGroup[j]).remove();
          }
          prevNode = firstP;
          currGroup = [];
        }
        emptyCount = 0; // Reset empty count after <hr>
        prevNode = node; // Update prevNode to <hr>
      }
    }

    // Handle any trailing group
    if (currGroup.length > 0) {
      const firstP = currGroup[0];
      const lines = currGroup.map((n) => $(n).html().trim());
      $(firstP).html(lines.join("<br>"));
      for (let j = 1; j < currGroup.length; j++) {
        $(currGroup[j]).remove();
      }
      currGroup = [];
    }
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
            .find((i) => i.includes("filename"))
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

    if (Object.keys(metadata).length > 0) {
      html = "---\n" + yaml.stringify(metadata) + "---\n" + html;
    }

    // make output more readable by inserting new lines after block elements
    // handle hr and br separately as it is self-closing
    html = html
      .replace(/<\/(h1|h2|h3|h4|h5|h6|p|blockquote|ul|ol|li)>/g, "</$1>\n")
      .replace(/<(hr|br)[^>]*>/g, "<$1>\n")
      .trim();
      
    callback(null, html, stat);
  } catch (err) {
    callback(err);
  }
}

module.exports = { read: read, is: is, id: "gdoc" };
