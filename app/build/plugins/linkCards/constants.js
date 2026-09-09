const CACHE_DIRECTORY = "_link_cards";
const THUMBNAIL_DIRECTORY = "link_cards";
const ICON_DIRECTORY = "link_cards/icons";
const THUMBNAIL_WIDTHS = [240, 480, 960];
const DEFAULT_LAYOUT = "compact";
const VALID_LAYOUTS = new Set(["compact", "large"]);
const REQUEST_TIMEOUT = 10000;

// A bare external link that fails to resolve (site down, 5xx, blocked by the
// airlock) is cached as a negative result for this long so every rebuild
// doesn't re-attempt the network fetch. See loader.js.
const NEGATIVE_CACHE_TTL = 6 * 60 * 60 * 1000; // 6 hours

// Upper bound on the number of links a single entry will turn into cards, and
// how many are fetched at once. Keeps a post full of dead links from blowing
// the plugin's overall timeout (see build/plugins/index.js) and losing every
// card transform.
const MAX_CARDS_PER_ENTRY = 25;
const FETCH_CONCURRENCY = 4;

module.exports = {
  CACHE_DIRECTORY,
  THUMBNAIL_DIRECTORY,
  ICON_DIRECTORY,
  THUMBNAIL_WIDTHS,
  DEFAULT_LAYOUT,
  VALID_LAYOUTS,
  REQUEST_TIMEOUT,
  NEGATIVE_CACHE_TTL,
  MAX_CARDS_PER_ENTRY,
  FETCH_CONCURRENCY,
};
