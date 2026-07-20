const fs = require("fs-extra");

module.exports = (path) => {
  let file = fs.readFileSync(path, "utf-8");
  let lines = csvToArray(file.trim());

  let header = lines.shift();

  return lines.map((line) => {
    let res = {};

    line.forEach((item, i) => {
      res[header[i]] = item;
    });

    return res;
  });
};

// Source: https://stackoverflow.com/questions/8493195/how-can-i-parse-a-csv-string-with-javascript-which-contains-comma-in-data
// Return array of string values, or NULL if CSV string not well formed.
function csvToArray(text) {
  let p = "",
    row = [""],
    ret = [row],
    i = 0,
    r = 0,
    s = !0,
    l;
  for (l of text) {
    if ('"' === l) {
      if (s && l === p) row[i] += l;
      s = !s;
    } else if ("," === l && s) l = row[++i] = "";
    else if ("\n" === l && s) {
      if ("\r" === p) row[i] = row[i].slice(0, -1);
      row = ret[++r] = [(l = "")];
      i = 0;
    } else row[i] += l;
    p = l;
  }
  return ret;
}
