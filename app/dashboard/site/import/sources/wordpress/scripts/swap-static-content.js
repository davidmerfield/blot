var fs = require("fs-extra");

// This script will walk a directory recursively
// and replace links to a given hostname with a
// relative path to a file if it exists in the
// static directory passed to this script.

var input_directory = process.argv[2];
var static_directory = process.argv[3];
var hosts = process.argv.slice(4);

if (!input_directory)
  throw new Error(
    "Please pass source directory containing output of export script as first argument"
  );

if (!static_directory)
  throw new Error("Please pass static directory as second argument");

if (!hosts.length)
  throw new Error(
    "Please pass hostname(s) to check against as third argument(s)"
  );

console.log("Source:", input_directory);
console.log("WP-Content:", static_directory);
console.log("Hosts:", hosts);

var output_directory = input_directory + "-" + Date.now();
var total_urls = 0;

// We don't want to clobber anything so make a
// copy of the source directory to manipulate
fs.copySync(input_directory, output_directory);

walk(output_directory);

console.log("");
console.log("Finished output_directory:", output_directory);

function walk(input_directory) {
  fs.readdirSync(input_directory).forEach(function (item) {
    if (fs.statSync(input_directory + "/" + item).isDirectory())
      return walk(input_directory + "/" + item);

    // Text file that is not in its own directory
    if (item.indexOf(".txt") > -1) {
      fix_text_file(input_directory + "/" + item);
    }
  });
}

function fix_text_file(path) {
  var pathWithAssets = path;

  if (require("path").basename(pathWithAssets) !== "post.txt") {
    pathWithAssets = path.slice(0, -".txt".length) + "/post.txt";
  }

  var folderWithAssets = require("path").dirname(pathWithAssets);

  var post = fs.readFileSync(path, "utf-8");
  var $ = require("cheerio").load(require("marked")(post));
  var urls = [];

  $("[src], [href]").each(function (url, host, parsed, pathToImage, exists) {
    url = $(this).attr("src") || $(this).attr("href");
    parsed = require("url").parse(url);
    host = parsed.host;
    pathToImage = parsed.path;
    exists =
      !!pathToImage &&
      pathToImage !== "/" &&
      fs.existsSync(static_directory + pathToImage);

    if (hosts.indexOf(host) === -1) {
      // console.log(host, hosts, '--------');
      if (exists) {
        console.log("Skipping host", host, "although path exists", pathToImage);
      }

      return;
    }

    // console.log("-------");
    // console.log("URL:", url);
    // console.log("Path:", pathToImage);
    // console.log("Exists?", exists);

    if (!exists) {
      console.log("ENOENT", host, pathToImage);
      return;
    }

    var fullSizeRegex = /\-\d+\x\d+/gm;
    var pathToFullSizeImage = pathToImage.replace(fullSizeRegex, "");

    if (pathToFullSizeImage !== pathToImage) {
      // console.log(
      //   "FULL SIZE IMAGE FOUND",
      //   pathToFullSizeImage,
      //   "<---",
      //   pathToImage
      // );
      pathToImage = pathToFullSizeImage;
    }

    var filename = "_" + require("path").basename(pathToImage);
    urls.push({ url: url, filename: filename });
    fs.copySync(
      static_directory + pathToImage,
      folderWithAssets + "/" + filename
    );
  });

  if (urls.length) {
    total_urls = total_urls + urls.length;

    // console.log("Path with assets", pathWithAssets);
    // console.log("Folder with assets", folderWithAssets);

    urls.forEach(function (item) {
      post = post.split(item.url).join(item.filename);
    });

    fs.removeSync(path);
    fs.outputFileSync(pathWithAssets, post);
  }
}

console.log("Replaced", total_urls, "urls");
