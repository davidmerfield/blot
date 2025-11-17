// Pandoc is very strict and treats indents inside
// HTML blocks as code blocks. This is correct but
// bad user experience. For instance this:
//
// <table>
//     <td>[Hey!](/goo)</td>
// </table>
//
// Becomes:
//
// <table>
// <pre><code><td>[Hey!](/goo)</td></code></pre>
// </table>
//
// This is obviously not desirable. But we want to
// mix HTML and Markdown in the same file. So I wrote
// a little script to collapse the indentation
// for the contents of an HTML tag. This preserves
// indentation in text! More discussion of this issue:
// https://github.com/jgm/pandoc/issues/1841

// This function will not remove the indents for pre
// formatted text <pre> since pandoc will leave those.
var cheerio = require("cheerio");
var $ = cheerio.load("", null, false);

function indentation (text) {
  // Ensure the text contains the ingredients
  // needed for a complete HTML tag! (<,>,/)
  if (!/<|>|\//.test(text)) return text;

  var before = text;
  var lines = text.split("\n");
  var totalLines = lines.length;

  for (var i = 0; i < totalLines; i++) {
    var line = lines[i];
    var closingIndex = null;
    var name = firstTag(line);

    if (leadingWhitespace(line)) continue;

    if (hasPreTag(line)) {
      for (var l = i + 1; l < totalLines; l++) {
        if (hasPreTag(lines[l])) {
          i = l;
          break;
        }
      }

      continue;
    }

    if (!name) continue;

    for (var x = i; x < totalLines; x++) {
      if (hasClosingTag(lines[x], name)) {
        closingIndex = x;
        break;
      }
    }

    if (closingIndex === null) continue;

    for (var y = i; y <= closingIndex; y++) lines[y] = trimLeading(lines[y]);

    i = closingIndex; // -1 ? what if the next opens on this line...
  }

  text = lines.join("\n");

  if (verify(before, text)) {
    return text;
  } else {
    return before;
  }
}

// ensure the only thing that has changed
// is whitespace...
function verify (before, after) {
  before = before.replace(/\s/g, "");
  after = after.replace("/s/g", "");

  if (after !== before) return before;

  return after;
}

function hasPreTag (line) {
  return line.indexOf("```") > -1;
}

function hasClosingTag (line, name) {
  return line.indexOf("</" + name + ">") > -1;
}

function firstTag (str) {
  str = str.trim();
  return str[0] === "<" && str.indexOf(">") > 0 && $(str)[0].name;
}

function leadingWhitespace (str) {
  return /^\s/.test(str);
}

function trimLeading (str) {
  return str.slice(str.indexOf(str.trim()));
}

module.exports = indentation;
