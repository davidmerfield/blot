const fs = require("fs-extra");
const ensure = require("helper/ensure");
const LocalPath = require("helper/localPath");
const extname = require("path").extname;
const cheerio = require("cheerio");
const Metadata = require("build/metadata");
const extend = require("helper/extend");
const yaml = require("yaml");

const blockquotes = require("./blockquotes");
const footnotes = require("./footnotes");
const linebreaks = require("./linebreaks");
const processImages = require("./images");

function is(path) {
  return [".gdoc"].indexOf(extname(path).toLowerCase()) > -1;
}

async function read(blog, path, callback) {
  ensure(blog, "object").and(path, "string").and(callback, "function");

  try {
    const localPath = LocalPath(blog.id, path);

    const stat = await fs.stat(localPath);

    // Don't try and turn HTML exported from a google doc into posts
    // if it's over 10MB in size
    if (stat && stat.size > 10 * 1000 * 1000)
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

    // handle line breaks
    if (blog.flags.google_docs_preserve_linebreaks !== false) {
      linebreaks($);
    }

    await processImages(blog.id, path, $);

    // handle blockquotes
    blockquotes($);

    // handle footnotes
    footnotes($);

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
