var cheerio = require("cheerio");
var basename = require("path").basename;
var parse = require("url").parse;
var each_el = require("./each_el");
var fs = require("fs-extra");
var callOnce = require("helper/callOnce");

var TIMEOUT = 5 * 1000; // 10s

function download(url, _callback) {
  console.log("Attempting to download", url);

  var time;

  var callback = callOnce(function (err, data) {
    console.log("Finishing attempt to download", url);
    clearTimeout(time);
    _callback(err, data);
  });

  if (!require("url").parse(url).hostname)
    return callback(new Error("Failed to parse hostname: " + url));

  if (!url || url.indexOf("data:") === 0)
    return callback(new Error("Invalid URL: " + url));

  time = setTimeout(function () {
    console.log("Timing out downloading", url);
    callback(new Error("Timeout: >10s downloading " + url));
  }, TIMEOUT);

  fetch(url)
    .then(function (res) {
      if (!res.ok) {
        return callback(new Error("Bad status code: " + res.status));
      }
      console.log("Successfully downloaded", url);

      return res.buffer();
    })
    .then(function (data) {
      callback(null, data);
    })
    .catch(function (err) {
      console.log("Failed to download", url, err);
      callback(err);
    });
}

module.exports = function download_pdfs(post, callback) {
  var changes = false;

  // if (post.html.indexOf('pdf-embedder') > -1) {
  //   console.log('<<- ', post.html, ' ->>');
  //   throw new Error();
  // }

  var reg = /\[pdf-embedder(.*)\]/gm;

  post.html = post.html.replace(reg, function (str, x) {
    if (x.indexOf("url=")) x = x.split("url=").join("href=");

    return "\n\n<a" + x + ">PDF</a>\n\n";
  });

  // post.html = post.html.split('\\[pdf-embedder url="').join('\n\n<a href="');
  // post.html = post.html.split('"\\]').join("</a>\n\n");

  var $ = cheerio.load(post.html, { decodeEntities: false });

  each_el(
    $,
    "a",
    function (el, next) {
      var href = $(el).attr("href");
      var name;

      try {
        name = nameFrom(href);
      } catch (e) {
        return next();
      }

      if (name.charAt(0) !== "_") name = "_" + name;

      if (require("path").extname(href) !== ".pdf") return next();

      console.log("Attempting to download", href);

      download(href, function (err, data) {
        if (err) {
          console.log("PDF error:", href, err.name, err.statusCode);
          return next();
        }

        fs.outputFile(post.path + "/" + name, data, function (err) {
          if (err) return next();

          if ($(el).text() === href) {
            $(el).text(name);
          }

          changes = true;

          $(el).attr("href", name);

          next();
        });
      });
    },
    function () {
      post.html = $.html();
      callback(null, post);
    }
  );
};

function nameFrom(src) {
  return "_" + basename(parse(src).pathname);
}
