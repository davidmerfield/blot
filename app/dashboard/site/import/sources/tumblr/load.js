const fetch = require("node-fetch");
const fs = require("fs-extra");
const API_KEY = process.env.BLOT_TUMBLR_KEY;
const URL_TEMPLATE =
  "http://api.tumblr.com/v2/blog/{{url}}/{{resource}}?api_key={{API_KEY}}";

function tidy_source_url (source_url) {
  return source_url
    .replace(/https?:\/\//, "")
    .split("/")
    .join("");
}

async function main (source_url) {
  source_url = tidy_source_url(source_url);

  const info = await get_info(source_url);
  const posts = await get_posts(source_url, info.total_posts);

  const blog = {
    title: info.title,
    posts: posts,
    host: new URL(info.url).host
  };

  return blog;
}

async function get_posts (source_url, total_posts) {
  let posts = [];
  const limit = 20;

  for (let offset = 0; offset < total_posts; offset += limit) {
    const url = URL_TEMPLATE.replace("{{url}}", source_url)
      .replace("{{offset}}", offset)
      .replace("{{limit}}", limit)
      .replace("{{API_KEY}}", API_KEY)
      .replace("{{resource}}", "posts");
    console.log(posts.length);

    const response = await fetch(url);
    const body = await response.json();
    posts = posts.concat(body.response.posts);
  }

  console.log("Done!");
  return posts;
}

async function get_info (source_url) {
  const url = URL_TEMPLATE.replace("{{url}}", source_url)
    .replace("{{API_KEY}}", API_KEY)
    .replace("{{resource}}", "info");

  const response = await fetch(url);
  const body = await response.json();
  return body.response.blog;
}

if (require.main === module) {
  const source_url = process.argv[2];
  const output_file = process.argv[3];

  if (!source_url) throw new Error("Please pass tumblr URL as first argument");
  if (!output_file)
    throw new Error("Please pass filename to write blog to as second argument");

  main(source_url)
    .then(blog => fs.outputJson(output_file, blog, { spaces: 2 }))
    .then(() => process.exit())
    .catch(err => {
      throw err;
    });
}

module.exports = main;
