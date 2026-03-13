const fs = require("fs-extra");
const helper = require("dashboard/importer/helper");
const { marked } = require("marked");

const input_directory = process.argv[2];
const output_directory = input_directory + "-output";

const posts = fs
  .readdirSync(input_directory)
  .filter(
    filename =>
      fs.statSync(input_directory + "/" + filename).isFile() &&
      filename[0] !== "."
  )
  .map(filename => {
    let file = fs
      .readFileSync(input_directory + "/" + filename, "utf-8")
      .trim();
    let post = {};

    post.title = file.split("\n")[0].slice(2);
    post.html = marked.parse(file.split("\n").slice(1).join("\n"));
    post.slug = filename.slice(0, filename.indexOf("_"));
    post.id = filename.slice(filename.indexOf("_") + 1);
    post.permalink = "/" + post.slug;

    post.dateStamp =
      post.created =
      post.updated =
        fs.statSync(input_directory + "/" + filename).mtime.valueOf();
    post.draft = post.page = false;

    return post;
  });

console.log(posts);

// Writes each post in the post array,
// downloads any images, pdfs
helper.process(output_directory, posts);
