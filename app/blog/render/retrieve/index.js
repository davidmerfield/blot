const ensure = require("helper/ensure");

const all_entries = require("./all_entries");
const all_tags = require("./all_tags");
const recent_entries = require("./recent_entries");
const latest_entry = require("./latest_entry");
const is_active = require("./is_active");
const absolute_urls = require("./absolute_urls");
const encode_json = require("./encode_json");
const encode_xml = require("./encode_xml");
const encode_uri_component = require("./encode_uri_component");
const app_css = require("./app_css");
const app_js = require("./app_js");

const dictionary = {
  absolute_urls: absolute_urls,
  absoluteURLs: absolute_urls,
  active: require("./active"),
  all_entries: all_entries,
  allEntries: all_entries,
  all_tags: all_tags,
  allTags: all_tags,
  app_css: app_css,
  appCSS: app_css,
  app_js: app_js,
  appJS: app_js,
  archives: require("./archives"),
  asset: require("./asset"),
  avatar_url: require("./avatar_url"),
  cdn: require("./cdn"),
  css_url: require("./css_url"),
  encode_json: encode_json,
  encodeJSON: encode_json,
  encode_uri_component: encode_uri_component,
  encodeURIComponent: encode_uri_component,
  encode_xml: encode_xml,
  encodeXML: encode_xml,
  feed_url: require("./feed_url"),
  folder: require("./folder"),
  is: require("./is"),
  is_active: is_active,
  isActive: is_active,
  latest_entry: latest_entry,
  latestEntry: latest_entry,
  plugin: require("./plugin"),
  plugin_css: app_css,
  plugin_js: app_js,
  popular_tags: require("./popular_tags"),
  posts: require("./posts"),
  recent_entries: recent_entries,
  recentEntries: recent_entries,
  rgb: require("./rgb"),
  script_url: require("./script_url"),
  search_query: require("./search_query"),
  search_results: require("./search_results"),
  tagged: require("./tagged"),
  total_posts: require("./total_posts"),
  updated: require("./updated"),
};

module.exports = async function retrieve(req, res, needed) {
  ensure(req, "object").and(needed, "object");

  const locals = {};
  req.retrieve = needed;

  const localNames = Object.keys(needed);
  req.log("retrieve: start", `locals=[${localNames.join(",")}]`);

  await Promise.all(
    localNames.map(async (localName) => {
      if (dictionary[localName] === undefined) {
        req.log("retrieve: skipping unknown local", `name=${localName}`);
        return;
      }

      req.log("retrieve: fetching", `name=${localName}`);

      try {
        const value = await dictionary[localName](req, res);
        if (value !== undefined) {
          locals[localName] = value;
          const valueSize = Array.isArray(value)
            ? value.length
            : value && typeof value === "object"
            ? Object.keys(value).length
            : 1;
          req.log("retrieve: fetched", `name=${localName}`, `size=${valueSize}`);
        } else {
          req.log("retrieve: fetched (undefined)", `name=${localName}`);
        }
      } catch (err) {
        req.log("retrieve: error", `name=${localName}`, err.message);
        console.log(err);
      }
    })
  );

  req.log("retrieve: complete", `totalLocals=${Object.keys(locals).length}`);
  return locals;
};

// Every name (canonical + alias) blot knows how to fetch. Exposed so
// models/template can tell a real retrieve dependency from stale metadata.
module.exports.dictionary = dictionary;
