const titlecase = require("helper/titlecase");

function render($, callback) {
  try {
    $("h1, h2, h3, h4, h5, h6").each(function findTextNodes(i, node) {
      $(node)
        .contents()
        .each((i, childNode) => {
          if (childNode.nodeType === 3) {
            $(childNode).replaceWith(titlecase(childNode.data));
          } else {
            findTextNodes(i, childNode);
          }
        });
    });
  } catch (e) {}

  return callback();
}

module.exports = {
  render: render,
  isDefault: false,
  category: "headings",
  title: "Titlecase",
  description: "Use title case for headings",
};
