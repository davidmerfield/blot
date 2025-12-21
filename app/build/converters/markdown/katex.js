var katex = require("katex");

var DISPLAY_DELIMITER = "$$";
var INLINE_DELIMITER = "$";
var PLACEHOLDER = "\u0000";

// eventually replace this and use pandoc instead.

module.exports = function (text) {
  if (!text) return text;

  var placeholders = [];

  // Protect fenced code blocks and inline code from Katex parsing
  text = text.replace(/(```[\s\S]*?```|~~~[\s\S]*?~~~|`[^`]*`)/g, function (match) {
    placeholders.push(match);
    return PLACEHOLDER + (placeholders.length - 1) + PLACEHOLDER;
  });

  text = parseMath(text);

  // Restore protected sections
  text = text.replace(new RegExp(PLACEHOLDER + "(\\d+)" + PLACEHOLDER, "g"), function (_match, index) {
    return placeholders[index];
  });

  return text;
};

function parseMath (text) {
  var result = "";
  var i = 0;

  while (i < text.length) {
    if (startsWithDelimiter(text, DISPLAY_DELIMITER, i) && !isEscaped(text, i)) {
      var displayEnd = findClosingDelimiter(text, DISPLAY_DELIMITER, i + DISPLAY_DELIMITER.length);

      if (displayEnd !== -1) {
        var displayContent = text.slice(i + DISPLAY_DELIMITER.length, displayEnd);
        result += renderTex(displayContent, { delimiter: DISPLAY_DELIMITER, display: true });
        i = displayEnd + DISPLAY_DELIMITER.length;
        continue;
      } else {
        result += DISPLAY_DELIMITER;
        i += DISPLAY_DELIMITER.length;
        continue;
      }
    }

    if (text.charAt(i) === INLINE_DELIMITER && !startsWithDelimiter(text, DISPLAY_DELIMITER, i) && !isEscaped(text, i)) {
      if (isDigit(text.charAt(i - 1)) || isDigit(text.charAt(i + 1))) {
        result += text.charAt(i);
        i++;
        continue;
      }

      var inlineEnd = findClosingDelimiter(text, INLINE_DELIMITER, i + 1, true);

      if (inlineEnd !== -1) {
        var inlineContent = text.slice(i + 1, inlineEnd);
        result += renderTex(inlineContent, { delimiter: INLINE_DELIMITER, display: false });
        i = inlineEnd + 1;
        continue;
      }
    }

    result += text.charAt(i);
    i++;
  }

  return result;
}

function findClosingDelimiter (text, delimiter, startIndex, inline) {
  var index = startIndex;

  while (index < text.length) {
    if (startsWithDelimiter(text, delimiter, index) && !isEscaped(text, index)) {
      if (inline && delimiter === INLINE_DELIMITER) {
        // Avoid treating '$$' as the end of inline math
        if (startsWithDelimiter(text, DISPLAY_DELIMITER, index)) {
          index += DISPLAY_DELIMITER.length;
          continue;
        }

        if (isDigit(text.charAt(index - 1)) || isDigit(text.charAt(index + delimiter.length))) {
          index += delimiter.length;
          continue;
        }
      }

      return index;
    }

    index++;
  }

  return -1;
}

function startsWithDelimiter (text, delimiter, index) {
  return text.slice(index, index + delimiter.length) === delimiter;
}

function isEscaped (text, index) {
  var backslashCount = 0;
  var i = index - 1;

  while (i >= 0 && text.charAt(i) === "\\") {
    backslashCount++;
    i--;
  }

  return backslashCount % 2 === 1;
}

function isDigit (char) {
  return char !== undefined && /\d/.test(char);
}

function renderTex (str, options) {
  // Cache the original string
  // in case of rendering error
  var _str = str;
  var delimiter = options && options.delimiter ? options.delimiter : DISPLAY_DELIMITER;
  var display = options && options.display;

  // Null or empty string, return delimiters
  // This is to guard against '$$$$' being in a post
  if (!str) return "";

  // If the Katex is on its own line, render it
  // in the larger 'display style'.
  var addDisplayStyle = display && str.replace(" ", "").charAt(0) == "\n";

  if (addDisplayStyle) {
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
