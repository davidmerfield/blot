var download = require("./index");
var fs = require("fs-extra");

var urls = {
  "bad": "foo",
  "terrible": null,
  "200": "http://i.imgur.com/A5Apd1a.jpg",
  "404": "http://imgur.com/fhsdjkfhsjkdfhkjsadhfjksdahfkjahsdkjfads.jpg",
};

var url = urls["404"];

require("shelljs/global");

console.log();
console.log("Downloading", url);

download(url, {}, function (err, path, headers) {
  console.log();

  if (err) console.log(err);

  if (path) {
    console.log("Downloaded", path);
    exec("open " + path);
    // rm(path);
  }

  if (!path) console.log("DIDNT DOWNLOAD", url);

  if (headers) console.log(headers);

  console.log();
  console.log("Re-downloading", url);

  download(url, headers, function (err, path, headers) {
    console.log();

    if (err) console.log(err);

    if (path) console.log("Downloaded", path);

    if (!path) console.log("DIDNT DOWNLOAD", url);

    if (headers) console.log(headers);
  });
});
