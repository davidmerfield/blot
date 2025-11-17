const fs = require("fs-extra");
const helper = require("dashboard/site/import/helper");
const { marked } = require("marked");
const yaml = require("yaml");
const moment = require("moment");
const walk = helper.walk;
const basename = require("path").basename;
const cheerio = require("cheerio");

const input_directory = process.argv[2];
const host = process.argv[3];
const output_directory =
  (input_directory.endsWith("/")
    ? input_directory.slice(0, -1)
    : input_directory) + "-output";

if (fs.existsSync(output_directory)) {
  fs.emptyDirSync(output_directory);
}

(async () => {
  const paths = walk(input_directory).filter(
    path =>
      fs.statSync(path).isFile() &&
      basename(path)[0] !== "." &&
      basename(path).toLowerCase().endsWith(".md")
  );

  const posts = await Promise.all(
    paths.map(async path => {
      const filename = basename(path);
      let file = (await fs.readFile(path, "utf-8")).trim();

      const components = file.split("---");

      if (components.length < 3) return;

      const fm = components[1];
      const body = components.slice(2).join("---");
      const meta = yaml.parse(fm);

      let post = {};

      post.permalink = meta.url;
      post.title = meta.title;
      post.html = marked.parse(body);
      post.slug = meta.url.slice(
        meta.url.lastIndexOf("/") + 1,
        meta.url.lastIndexOf(".html")
      );
      post.id = filename.slice(0, filename.lastIndexOf("."));

      post.dateStamp =
        post.created =
        post.updated =
          moment(meta.date).valueOf();
      post.draft = post.page = false;

      const $ = cheerio.load(post.html);

      $("img").each(async function () {
        const src = $(this).attr("src");
        const url = require("url").parse(src);

        try {
          const newPath = "/_assets/" + require("path").basename(url.path);
          fs.copySync(input_directory + url.path, output_directory + newPath);
          $(this).attr("src", newPath);
        } catch (e) {
          console.log(
            "nothing found for",
            url.path,
            "via",
            url.hostname,
            e.message
          );
        }
      });

      post.html = $.html();

      return post;
    })
  );

  // throw "here!";

  // Writes each post in the post array,
  // downloads any images, pdfs
  helper.process(output_directory, posts, {
    preserve_output_directory: true
  });
})();
