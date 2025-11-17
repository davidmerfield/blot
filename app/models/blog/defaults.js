var defaultPlugins = require("build/plugins").defaultList;

module.exports = {
  client: "",
  title: "Blog",
  isDisabled: false,
  avatar: "",
  roundAvatar: false,
  imageExif: "basic",
  cssURL: "",
  scriptURL: "",
  template: "SITE:blog",
  menu: [],
  domain: "",
  permalink: { format: "{{slug}}", custom: "", isCustom: false },
  timeZone: "UTC",
  status: {
    message: "Created site",
    syncID: "",
    datestamp: Date.now(),
  },
  dateFormat: "M/D/YYYY",
  forceSSL: true,
  redirectSubdomain: true,
  plugins: defaultPlugins,
  cacheID: 0,
  flags: {
    google_drive_beta: false,
    deleted_entries_sanitized: false,
  },
};
