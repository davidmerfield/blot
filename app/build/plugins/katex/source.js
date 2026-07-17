const delimiter = "$$";

function extractMathSources(input) {
  if (!input || input.indexOf(delimiter) === -1) return input;

  let output = "";
  let position = 0;

  while (position < input.length) {
    const start = input.indexOf(delimiter, position);

    if (start === -1) {
      output += input.slice(position);
      break;
    }

    const end = input.indexOf(delimiter, start + delimiter.length);

    if (end === -1) {
      output += input.slice(position);
      break;
    }

    const sourceStart = start + delimiter.length;
    const source = input.slice(sourceStart, end);
    const afterEnd = end + delimiter.length;
    const display = isDisplayMath(input, start, sourceStart, afterEnd);

    output += input.slice(position, start);
    output += placeholder(source, display);
    position = afterEnd;
  }

  return output;
}

function placeholder(source, display) {
  const escaped = escapeHtml(source);

  if (display) {
    return '<pre class="blot-katex-source" data-display="true">' + escaped + "</pre>";
  }

  return '<span class="blot-katex-source" data-display="false">' + escaped + "</span>";
}

function escapeHtml(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function isDisplayMath(input, start, sourceStart, afterEnd) {
  if (input[sourceStart] === "\n" || input[sourceStart] === "\r") return true;

  return isOwnLineBefore(input, start) && isOwnLineAfter(input, afterEnd);
}

function isOwnLineBefore(input, start) {
  const lineStart = input.lastIndexOf("\n", start - 1) + 1;
  return /^\s*$/.test(input.slice(lineStart, start));
}

function isOwnLineAfter(input, afterEnd) {
  let lineEnd = input.indexOf("\n", afterEnd);
  if (lineEnd === -1) lineEnd = input.length;
  return /^\s*$/.test(input.slice(afterEnd, lineEnd));
}

module.exports = { extractMathSources };
