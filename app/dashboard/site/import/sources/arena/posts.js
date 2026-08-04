const fetch = require("node-fetch");
const PAGE_SIZE = 100;

module.exports = async function posts ({ slug, status, isCancelled }) {
  let page = 0;
  let posts = [];
  let new_posts;

  async function fetchPage (page) {
    if (isCancelled && await isCancelled()) return null;
    const url = base(slug, page);
    status(`Fetching page ${page + 1} of channel`);
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    return data.contents;
  }

  new_posts = await fetchPage(page);
  if (new_posts === null) return posts;
  posts = posts.concat(new_posts);
  page++;
  while (new_posts.length === PAGE_SIZE) {
    new_posts = await fetchPage(page);
    if (new_posts === null) return posts;
    posts = posts.concat(new_posts);
    page++;
  }

  status(`Fetched everything on channel`);
  return posts;
};

function base (slug, page) {
  return `https://api.are.na/v2/channels/${slug}/contents?direction=desc&sort=position&per=${PAGE_SIZE}&channel_slug=${slug}&page=${page}`;
}
