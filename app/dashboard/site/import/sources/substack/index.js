const csv = require("./csv");
const helper = require("dashboard/importer/helper");
const moment = require("moment");
const fs = require("fs-extra");

const input_directory = process.argv[2];
const output_directory = input_directory + "-output";

const posts = csv(input_directory + "/posts.csv").map((post) => {
  post.draft = post.is_published === "false";
  post.slug = post.post_id.slice(post.post_id.indexOf(".") + 1);
  post.permalink = "/p/" + post.slug;

  post.html = fs.readFileSync(
    `${input_directory}/posts/${post.post_id}.html`,
    "utf-8"
  );

  if (post.type === "podcast")
    post.html = `<audio src="${post.podcast_url}"></audio>\n\n` + post.html;

  if (post.post_date)
    post.dateStamp = post.created = post.updated = moment(
      post.post_date
    ).valueOf();

  return post;
});

// Writes each post in the post array,
// downloads any images, pdfs
helper.process(output_directory, posts);
