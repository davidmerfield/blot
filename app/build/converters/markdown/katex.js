var delimiter = "$$";
var katex = require("katex");

// eventually replace this and use pandoc instead.

module.exports = function (text) {
  if (!text) return text;

  var tokens = text.split(delimiter);
  var totalTokens = tokens.length;
  var remainder = "";

  // If there are fewer than three items
  // then there is no Katex in the HTML string
  if (totalTokens < 3) return text;

  // There's an unclosed delimiter
  // so save the remainder
  if (totalTokens % 2 !== 1) {
    remainder = delimiter + tokens.pop();
  }

  // To each of the tokens which contain
  // a tex string, render its contents
  for (var i = 0; i < totalTokens; i++)
    if (i % 2 === 1 && totalTokens >= i + 1) tokens[i] = renderTex(tokens[i]);

  text = tokens.join("") + remainder;

  return text;
};

function renderTex (str) {
  // Cache the original string
  // in case of rendering error
  var _str = str;

  // Null or empty string, return delimiters
  // This is to guard against '$$$$' being in a post
  if (!str) return "";

  // If the Katex is on its own line, render it
  // in the larger 'display style'.
  var display = str.replace(" ", "").charAt(0) == "\n";

  if (display) {
    str = "\\displaystyle {" + str + "}";
  }

  // If there is a rendering error,
  // reset to the source string with delimiters
  try {
    str = katex.renderToString(str);
    if (display) str = '<p class="has-katex">' + str + "</p>";
  } catch (e) {
    str = delimiter + _str + delimiter;
  }

  return str;
}
