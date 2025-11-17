var cheerio = require("cheerio");
var basename = require("path").basename;
var parse = require("url").parse;
var each_el = require("./each_el");
var fs = require("fs-extra");
var sharp = require("sharp");
var callOnce = require("helper/callOnce");

// Consider using this algorithm to determine best part of alt tag or caption to use
// as the file's name:
// http://www.bearcave.com/misl/misl_tech/wavelets/compression/shannon.html
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

      return res.blob(); // First get the blob
    })
    .then(function (blob) {
      return blob.arrayBuffer(); // Convert blob to arrayBuffer
    })
    .then(function (arrayBuffer) {
      const buffer = Buffer.from(arrayBuffer); // Convert arrayBuffer to Buffer
      sharp(buffer).metadata(function (err, metadata) {
        var format;
        if (metadata && metadata.format) {
          format = metadata.format;
        }

        callback(null, buffer, format);
      });
    })
    .catch(function (err) {
      console.log("Failed to download", url, err);
      callback(err);
    });
}

function download_thumbnail(post, path, callback) {
  if (!post || !post.metadata || !post.metadata.thumbnail) return callback();

  var thumbnail = post.metadata.thumbnail;

  if (!thumbnail) return callback();

  var name = nameFrom(thumbnail);

  if (name.charAt(0) !== "_") name = "_" + name;

  download(thumbnail, function (err, data, format) {
    if (err || !data) return callback(err);

    if (format && !name.toLowerCase().endsWith(format.toLowerCase()))
      name = name + "." + format;

    fs.outputFile(path + "/" + name, data, function (err) {
      if (err) return callback(err);
      callback(null, name);
    });
  });
}

module.exports = function download_images(post, callback) {
  var changes = false;
  var $ = cheerio.load(post.html, { decodeEntities: false });

  download_thumbnail(post, post.path, function (err, thumbnail) {
    if (!err && thumbnail) {
      changes = true;
      post.metadata.thumbnail = thumbnail;
    }

    each_el(
      $,
      "img",
      function (el, next) {
        var src = $(el).attr("src");

        if (!src) return next();

        var name = nameFrom(src);

        if (name.charAt(0) !== "_") name = "_" + name;

        download(src, function (err, data, format) {
          if (err || !data) {
            return next();
          }

          if (format && !name.toLowerCase().endsWith(format.toLowerCase()))
            name = name + "." + format;

          fs.outputFile(post.path + "/" + name, data, function (err) {
            if (err) return next();
            changes = true;

            $(el).attr("src", name);

            if ($(el).parent().attr("href") === src)
              $(el).parent().attr("href", name);

            next();
          });
        });
      },
      function () {
        post.html = $.html();

        callback(null, post);
      }
    );
  });
};

function nameFrom(src) {
  return "_" + basename(parse(src).pathname);
}
