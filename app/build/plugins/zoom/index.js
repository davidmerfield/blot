// Don't zoom images smaller than this
var MIN_WIDTH = 320;
var Url = require("url");

function render($, callback) {
  $("img").each(function () {
    try {
      // Ignore img inside links
      if ($(this).parents("a").length) return;

      var src = $(this).attr("src");
      var width;

      width = $(this).attr("width") || $(this).attr("data-width");
      width = parseFloat(width);

      // Don't zoom images if they're tiny
      if (lacksZoomQuery(src) && width && width > MIN_WIDTH)
        $(this).attr("data-action", "zoom");
    } catch (e) {}
  });

  callback();
}

function lacksZoomQuery(src) {
  var parsed;

  if (src.indexOf("?") === -1) return true;

  parsed = Url.parse(src);

  if (parsed && parsed.query && parsed.query.indexOf("zoom=false") > -1)
    return false;

  return true;
}

module.exports = {
  render: render,
  isDefault: false,
  category: "images",
  title: "Zoomer",
  description: "Enable zoom on large images",
};
