const CACHE_DIRECTORY = "_link_cards";
const THUMBNAIL_DIRECTORY = "link_cards";
const ICON_DIRECTORY = "link_cards/icons";
const THUMBNAIL_WIDTHS = [240, 480, 960];
const DEFAULT_LAYOUT = "compact";
const VALID_LAYOUTS = new Set(["compact", "large"]);
const REQUEST_TIMEOUT = 10000;

module.exports = {
  CACHE_DIRECTORY,
  THUMBNAIL_DIRECTORY,
  ICON_DIRECTORY,
  THUMBNAIL_WIDTHS,
  DEFAULT_LAYOUT,
  VALID_LAYOUTS,
  REQUEST_TIMEOUT,
};
