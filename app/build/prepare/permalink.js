var makeSlug = require("helper/makeSlug");
var mustache = require("mustache");
var moment = require("moment");
var debug = require("debug")("blot:prepare:permalink");

require("moment-timezone");

var DEFAULT = "{{slug}}";

// this needs to be pulled directly from the moment library
// i copied them from the docs.
var MOMENT_TOKENS = [
  "M",
  "Mo",
  "MM",
  "MMM",
  "MMMM",
  "Q",
  "Qo",
  "D",
  "Do",
  "DD",
  "DDD",
  "DDDo",
  "DDDD",
  "d",
  "do",
  "dd",
  "ddd",
  "dddd",
  "e",
  "E",
  "w",
  "wo",
  "ww",
  "W",
  "Wo",
  "WW",
  "YY",
  "YYYY",
  "Y",
  "gg",
  "gggg",
  "GG",
  "GGGG",
  "A",
  "a",
  "H",
  "HH",
  "h",
  "hh",
  "k",
  "kk",
  "m",
  "mm",
  "s",
  "ss",
  "S",
  "SS",
  "SSS",
  "SSSS",
  "SSSSS",
  "SSSSSS",
  "SSSSSSS",
  "SSSSSSSS",
  "SSSSSSSSS",
  "z",
  "zz",
  "Z",
  "ZZ",
  "X",
  "x"
];
var normalize = require("helper/urlNormalizer");
var allow = [
  "slug",
  "name",
  "size",
  "path",
  "more",
  "menu",
  "page",
  "dateStamp",
  "created",
  "updated",
  "metadata"
];

// modified from here: https://gist.github.com/mathewbyrne/1280286
// also using https://help.ivanti.com/res/help/en_US/IA/2021/Admin/Content/35149.htm
function removeDiacritics (str) {
  str = str || "";
  str = decodeURIComponent(str); // lol we shouldnt do this
  str = str.toLowerCase();

  var swaps = [
    { from: "œ", to: "oe" },
    { from: "ö", to: "oe" },
    { from: "æ", to: "ae" },
    { from: "ä", to: "ae" },
    { from: "å", to: "aa" },
    { from: "þ", to: "th" },
    { from: "ü", to: "ue" },
    { from: "ß", to: "ss" }
  ];

  for (const item of swaps) {
    const { from, to } = item;
    str = str.replace(new RegExp(from, "g"), to);
  }

  var from = "àáâãåāçćčèéêëēėęîïíīįìłñńôòóøōõśšûùúūųŵÿýŷžźż";
  var to = "aaaaaaccceeeeeeeiiiiiilnnoooooossuuuuuwyyyzzz";

  for (var i = 0, l = from.length; i < l; i++)
    str = str.replace(new RegExp(from.charAt(i), "g"), to.charAt(i));

  str = encodeURIComponent(str);

  return str;
}

module.exports = function (timeZone, format, entry) {
  // Add the permalink automatically if the metadata
  // declared a page with no permalink set. We can't
  // do this earlier, since we don't know the slug then
  var permalink = "";
  var view = {};

  format = format || DEFAULT;

  try {
    // this is so inefficient
    MOMENT_TOKENS.forEach(function (token) {
      view[token] = moment
        .utc(entry.dateStamp || entry.updated)
        .tz(timeZone)
        .format(token);
    });

    for (var i in entry) if (allow.indexOf(i) > -1) view[i] = entry[i];

    // this needs a better name but make sure to update any
    // existing custom formats for folks...
    view["path-without-extension"] = entry.path.slice(
      0,
      entry.path.lastIndexOf(".")
    );

    // stem should be path without extension
    view.stem = makeSlug(view["path-without-extension"]);

    // this needs a better name but make sure to update any
    // existing custom formats for folks...
    view["name-without-extension"] = view.name.slice(
      0,
      view.name.lastIndexOf(".")
    );

    // this needs a better name but make sure to update any
    // existing custom formats for folks...
    view["slug-without-diacritics"] = removeDiacritics(view.slug);

    // we don't want mustache to escape anything...
    format = format.split("{{").join("{{{");
    format = format.split("}}").join("}}}");
    debug("format", format);
    debug("view", view);
    permalink = mustache.render(format || DEFAULT, view);
    debug("permalink", permalink);
  } catch (e) {
    console.log(e);
    permalink = "";
  }

  return normalize(permalink);
};
