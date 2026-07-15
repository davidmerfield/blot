// This is useful for maniplating colors for producing
// lower-opacity versions of the color, e.g.
// background: rgba({{#rgb}}{{text_color}}{{/rgb}}, 0.1);
const tinyColor = require("helper/tinyColor");

module.exports = function (req, res, callback) {
  return callback(null, function () {
    return function (text, render) {
      var rgb = "";

      text = render(text);

      try {
        let { r, g, b } = tinyColor(text).toRgb();
        rgb = `${r}, ${g}, ${b}`;
      } catch (e) {
        return text;
      }

      return rgb;
    };
  });
};
