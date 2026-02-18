var katex = require("katex");
var OPEN_TAG = "\\(";
var CLOSE_TAG = "\\)";

module.exports = $ => {
  var hadTex = false;

  $(":root").each(function () {
    findTextNodes(this);
  });

  // Inject stylesheet to render TeX
  if (hadTex) {
    $("head").append(
      '<link rel="stylesheet" type="text/css" href="/css/tex.css">'
    );
  }

  // This text does not contain LaTeX
  function has_TeX (text) {
    return text.indexOf(OPEN_TAG) !== -1 && text.indexOf(CLOSE_TAG) !== -1;
  }

  function render (text) {
    var TeX = text.slice(
      text.indexOf(OPEN_TAG) + OPEN_TAG.length,
      text.indexOf(CLOSE_TAG)
    );

    TeX = katex.renderToString(TeX, { throwOnError: false, strict: false });

    text =
      text.slice(0, text.indexOf(OPEN_TAG)) +
      TeX +
      text.slice(text.indexOf(CLOSE_TAG) + CLOSE_TAG.length);

    hadTex = true;

    return text;
  }

  function findTextNodes (node) {

    $(node)
      .contents()
      .each(function () {
        var childNode = this;

        if (childNode.type === "text") {
          var text = childNode.data;

          if (has_TeX(text)) {
            while (has_TeX(text)) {
              try {
                text = render(text);
              } catch (e) {
                break;
              }
            }
            $(childNode).replaceWith(text);
          }

        } else {
          findTextNodes(childNode);
        }
      });
  }
};
