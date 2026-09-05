module.exports = {
  slug: "relative-dates",
  title: "Relative dates",
  summary:
    "Replace {{date}} with “3 days ago” in the browser, using date-from-now=\"{{dateStamp}}\", and leave the original string if JavaScript is off.",
  category: "Scripts",
  sourceTemplates: [
    {
      name: "Magazine",
      files: [
        "app/templates/source/magazine/entry.html",
        "app/templates/source/magazine/script.js",
      ],
    },
    {
      name: "Links",
      files: [
        "app/templates/source/links/_post.html",
        "app/templates/source/links/script.js",
      ],
    },
    {
      name: "Album",
      files: ["app/templates/source/album/_grid_square.html"],
    },
  ],
  whenToUse:
    "Use this on indexes and grids where a relative time is easier to scan than a full calendar date. Keep the server-rendered {{date}} as the fallback. Skip it on archives, legal pages, or anywhere a precise date matters more than recency.",
  htmlFile: "entries.html",
  html: `{{#posts}}
<a class="post-row" href="{{{url}}}">
  <span class="post-title">{{title}}</span>
  {{#date}}
  <time date-from-now="{{dateStamp}}">{{date}}</time>
  {{/date}}
</a>
{{/posts}}`,
  cssFile: "style.css",
  css: `.post-row {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 0.35em 1em;
  color: inherit;
  text-decoration: none;
  margin: 0.4em 0;
}

.post-title {
  font-weight: 600;
}

.post-row time {
  opacity: 0.55;
  font-variant-numeric: tabular-nums;
}`,
  jsFile: "script.js",
  js: `(function () {
  var SECOND = 1000;
  var MINUTE = 60 * SECOND;
  var HOUR = 60 * MINUTE;
  var DAY = 24 * HOUR;
  var WEEK = 7 * DAY;
  var YEAR = DAY * 365;
  var MONTH = YEAR / 12;
  var YEAR_MS = 1000 * 60 * 60 * 24 * 30 * 12;

  var formats = [
    [0.7 * MINUTE, "just now"],
    [1.5 * MINUTE, "a minute ago"],
    [60 * MINUTE, "minutes ago", MINUTE],
    [1.5 * HOUR, "an hour ago"],
    [DAY, "hours ago", HOUR],
    [2 * DAY, "yesterday"],
    [7 * DAY, "days ago", DAY],
    [1.5 * WEEK, "a week ago"],
    [MONTH, "weeks ago", WEEK],
    [1.5 * MONTH, "a month ago"],
    [YEAR, "months ago", MONTH],
    [1.5 * YEAR, "a year ago"],
    [Number.MAX_VALUE, "years ago", YEAR]
  ];

  function relativeDate(input) {
    var delta = Date.now() - (input instanceof Date ? input.getTime() : input);
    for (var i = 0; i < formats.length; i++) {
      var format = formats[i];
      if (delta < format[0]) {
        return format[2] === undefined
          ? format[1]
          : Math.round(delta / format[2]) + " " + format[1];
      }
    }
  }

  document.querySelectorAll("[date-from-now]").forEach(function (el) {
    var dateStamp = parseInt(el.getAttribute("date-from-now"), 10);
    if (isNaN(dateStamp)) return;
    if (Date.now() - dateStamp > YEAR_MS) return;
    el.textContent = relativeDate(new Date(dateStamp));
  });
})();`,
  demoJS: `var SECOND = 1000;
var MINUTE = 60 * SECOND;
var HOUR = 60 * MINUTE;
var DAY = 24 * HOUR;
var WEEK = 7 * DAY;
var YEAR = DAY * 365;
var MONTH = YEAR / 12;
var YEAR_MS = 1000 * 60 * 60 * 24 * 30 * 12;

var formats = [
  [0.7 * MINUTE, "just now"],
  [1.5 * MINUTE, "a minute ago"],
  [60 * MINUTE, "minutes ago", MINUTE],
  [1.5 * HOUR, "an hour ago"],
  [DAY, "hours ago", HOUR],
  [2 * DAY, "yesterday"],
  [7 * DAY, "days ago", DAY],
  [1.5 * WEEK, "a week ago"],
  [MONTH, "weeks ago", WEEK],
  [1.5 * MONTH, "a month ago"],
  [YEAR, "months ago", MONTH],
  [1.5 * YEAR, "a year ago"],
  [Number.MAX_VALUE, "years ago", YEAR]
];

function relativeDate(input) {
  var delta = Date.now() - input;
  for (var i = 0; i < formats.length; i++) {
    var format = formats[i];
    if (delta < format[0]) {
      return format[2] === undefined
        ? format[1]
        : Math.round(delta / format[2]) + " " + format[1];
    }
  }
}

root.querySelectorAll("[data-offset-ms]").forEach(function (el) {
  var stamp = Date.now() - parseInt(el.getAttribute("data-offset-ms"), 10);
  if (Date.now() - stamp > YEAR_MS) return;
  el.textContent = relativeDate(stamp);
});`,
  demoHTML: `<a class="post-row" href="#"><span class="post-title">Just published</span><time data-offset-ms="20000">March 4, 2026</time></a>
<a class="post-row" href="#"><span class="post-title">A later harvest</span><time data-offset-ms="3600000">March 4, 2026</time></a>
<a class="post-row" href="#"><span class="post-title">Notes on citrus</span><time data-offset-ms="172800000">March 2, 2026</time></a>
<a class="post-row" href="#"><span class="post-title">Index of groves</span><time data-offset-ms="40000000000">January 12, 2025</time></a>`,
  demoCaption:
    "The last row is older than a year, so the script leaves the original date. That is the no-JS path for every row.",
  guidance: `\`dateStamp\` is the publication time as a Unix timestamp in milliseconds. Put it on the same element that already shows \`{{date}}\`.

**How to add it**

- The attribute name in the bundled templates is \`date-from-now\`, not \`data-from-now\`. Match that if you copy their script, or use \`data-\` and update the selector — both work, but do not mix them.
- Keep \`{{date}}\` as the element’s text. Crawlers, RSS, and no-JS readers still see a real date.
- Magazine wraps the script in \`{{#relative_dates}}\` so a dashboard flag can turn it off. Optional; omitting the script is the same switch.
- Skip timestamps older than a year (Magazine) or three months (Links). Old “11 months ago” strings go stale and are worse than “April 4, 2025”.
- Guard the markup with \`{{#date}}\`. Pages and undated menu items have no \`dateStamp\`.
- This is display-only. Do not use relative strings in \`<title>\` or Open Graph tags.

**Common mistakes**

- Passing \`{{date}}\` into the script and parsing the formatted string. That breaks when the date format changes. Always use \`{{dateStamp}}\`.
- \`el.innerHTML = …\` with a string you do not control. \`textContent\` is enough.
- Running this on \`archives.html\`, where grouping by calendar month is the point.`,
  accessibility: `- Prefer \`<time>\` over \`<span>\`. If you have a machine value, set \`datetime="{{#formatDate}}YYYY-MM-DD{{/formatDate}}"\` as well; relative text can stay in the body.
- Do not strip the original date from the DOM before replacing it. If the script throws, the calendar date should still be there.
- Relative strings like “yesterday” are locale-specific English in this snippet. If the site is not English, keep \`{{date}}\` or replace the \`formats\` table.`,
  related: ["archives-by-month", "pagination"],
};
