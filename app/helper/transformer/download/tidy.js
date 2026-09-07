function expire(str) {
  var now = Date.now();

  if (!str) return null;

  // Pull the delta-seconds out of a Cache-Control header, e.g.
  // "public, max-age=600, immutable" -> 600. The previous implementation
  // sliced to the start of "max-age=" but never past it, so parseInt
  // always saw "max-age=..." and returned NaN - meaning max-age was
  // silently ignored and such responses were re-downloaded every build.
  var match = /(?:^|[,\s])max-age\s*=\s*"?(\d+)"?/i.exec(str);

  if (!match) return null;

  var seconds = parseInt(match[1], 10);

  if (isNaN(seconds)) return null;

  return now + seconds * 1000;
}

function date(str) {
  var date = null;

  try {
    date = new Date(str).valueOf();
  } catch (e) {
    date = null;
  }

  if (isNaN(date)) date = null;

  return date;
}

module.exports = {
  date: date,
  expire: expire,
};
