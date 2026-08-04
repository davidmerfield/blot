const async = require("async");
const fs = require("fs-extra");
const helper = require("dashboard/site/import/helper");
const parse = require("./parse");

function processEntry(entry, outputDirectory) {
  return new Promise((resolve, reject) => {
    async.waterfall(
      [
        (next) => next(null, entry),
        helper.determine_path(outputDirectory),
        helper.download_pdfs,
        helper.download_images,
        helper.convert_to_markdown,
        helper.insert_metadata,
        helper.write,
      ],
      (err) => (err ? reject(err) : resolve())
    );
  });
}

async function importBlogger(sourceFile, outputDirectory, status) {
  status = typeof status === "function" ? status : () => {};
  await fs.emptyDir(outputDirectory);
  status("Reading Blogger export");
  const entries = await parse(await fs.readFile(sourceFile, "utf8"));

  if (!entries.length) {
    throw new Error("No published posts or pages found in this Blogger export.");
  }
  for (let index = 0; index < entries.length; index++) {
    status(`Processing ${index + 1} of ${entries.length} ${entries[index].title}`);
    await processEntry(entries[index], outputDirectory);
  }

  return entries.length;
}

// Supports both the dashboard's callback lifecycle and direct Promise use.
module.exports = function main(sourceFile, outputDirectory, status, callback) {
  const promise = importBlogger(sourceFile, outputDirectory, status);
  if (typeof callback === "function") {
    promise.then((count) => callback(null, count), callback);
    return;
  }
  return promise;
};

module.exports.parse = parse;
