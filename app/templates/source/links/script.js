// Plugin JavaScript for analytics embed code
{{{appJS}}}


/*

Close button on entry page
--------------------------

Purpose of this script is to allow the close button on the
entry page to behave like the browser back button. It works
out how far back in your navigation history you'd need to
go to. It sort of simulates a popover 'Close' button, if the
entry were a modal window in a slideshow. You can go to the
next or previous entry but then still return to the last index
page. Why bother doing this? When you press back, your browser
will return you to the old scroll offset with great speed.

*/

var articles = [{{#all_entries}}'{{{url}}}'{{^last}},{{/last}}{{/all_entries}}];
var backIndex;

determineBackIndex();

function determineBackIndex () {
  var localHistory = sessionStorage.getItem("localHistory");

  if (localHistory) {
    try {
      localHistory = JSON.parse(localHistory);
    } catch (e) {
      localHistory = [];
    }
  } else {
    localHistory = [];
  }

  localHistory = localHistory.slice(-50);
  localHistory.push(window.location);
  sessionStorage.setItem("localHistory", JSON.stringify(localHistory));

  // we go back in the list of visited pages until we find
  // an item which doesn't match a known entry's URL
  localHistory.reverse().forEach(function(href, i) {
    if (backIndex === undefined && articles.indexOf(decodeURIComponent(href.pathname)) === -1) {
      backIndex = i;
      return false;
    }
  });
}
// Safari does not re-run scripts when the page is navigated
// to using browser history, so we need to detect this event
// and re-calculate the index page in the history location.
window.addEventListener( "pageshow", function ( event ) {
  var historyTraversal = event.persisted || 
                         ( typeof window.performance != "undefined" && 
                              window.performance.navigation.type === 2 );
  if ( historyTraversal ) {
    determineBackIndex();
  }
});

function lastIndexPage() {
  // reset the list of pages visited
  sessionStorage.setItem("localHistory", JSON.stringify([]));
  if (backIndex !== undefined && -backIndex < 0 && window.history.length > backIndex) {
    window.history.go(-backIndex);    
  } else {
    window.location = '/';
  }
  return false;
}

function randomArticle() {
  window.location = articles[Math.floor(Math.random() * articles.length)];
  return false;
}


var searchInput = document.querySelectorAll('[name="q"]')[0];
var results = document.getElementById("results");
var searchForm = document.getElementById("searchForm");
var dropdown = document.getElementById("dropdown");
var linkToSearch = document.getElementById("link-to-search");

var index = null;

function moveFocusUp() {
  if (index === null) {
    index = 0;
  } else {
    index--;
  }

  setFocus();
}

function moveFocusDown() {
  if (index === null) {
    index = 0;
  } else {
    index++;
  }

  setFocus();
}

function setFocus() {
  var focussedLinks = document.querySelectorAll("#dropdown a");

  if (index > focussedLinks.length) {
    index = focussedLinks.length;
  }

  if (index < 0) {
    index = 0;
  }

  focussedLinks[index].focus();
}

// My take on jquery's $(node).parents(secondnode);
function parents(node, secondnode) {
  while (node.parentNode) {
    if (node.parentNode === secondnode) return true;
    node = node.parentNode;
  }
  return false;
}

var nextLink = document.querySelector('[data-next]');
var previousLink = document.querySelector('[data-previous]');
var nextURL = nextLink && nextLink.getAttribute('href');
var previousURL = previousLink && previousLink.getAttribute('href');

document.onkeydown = function(e) {

  if (previousURL && e.keyCode == '39') {
    return window.location = previousURL;
  }

   if (nextURL && e.keyCode == '37') {
    return window.location = nextURL;
  }

  if (!parents(document.activeElement, searchForm)) return;

  if (e.keyCode === 37 && document.activeElement !== searchInput) {
    searchInput.focus();
    e.preventDefault();
    return false;
  }

  if (e.keyCode !== 40 && e.keyCode !== 38) return;

  if (e.keyCode === 40) {
    moveFocusDown();
  } else if (e.keyCode === 38) {
    moveFocusUp();
  }

  e.preventDefault();
  return false;
};

function close() {
  dropdown.style.display = "none";
  index = null;
}

if (searchInput) {
searchInput.oninput = loadResults;
searchInput.onclick = loadResults;
}

function loadResults() {
  dropdown.addEventListener("mousedown", function(e) {
    e.stopPropagation();
  });

  document.body.addEventListener("mousedown", close);

  var query = searchInput.value;

  if (!query) {
    dropdown.style.display = "none";
    return;
  }

  dropdown.style.display = "block";

  linkToSearch.innerHTML = searchInput.value;
  linkToSearch.parentNode.href =
    "/search?q=" + encodeURIComponent(searchInput.value);

  httpGetAsync("/search?q=" + query + "&debug=true", function(res) {
    if (searchInput.value !== query) return;

    res = JSON.parse(res);

    // limit number of results to 15
    res.entries = res.entries.slice(0, 15);

    var result, html;
    html = "";
    res.entries.forEach(function(entry) {
      result = "";

      result += '<a class="result" href="' + entry.url + '">';

      result += '<span class="thumbnail">';

      if (entry.thumbnail && entry.thumbnail.square)
        result += '<img src="' + entry.thumbnail.square.url + '">';

      result += "</span>";

      result +=
        '<span class="title">' +
        entry.title.split(query).join("<b>" + query + "</b>") +
        '</span>';

      if (entry.date)
        result += '<span class="date"> - ' +
        entry.date +
        "</span>";

      result += "</a>";

      html += result;
    });
    results.innerHTML = html;
  });
}

function httpGetAsync(theUrl, callback) {
  var xmlHttp = new XMLHttpRequest();
  xmlHttp.onreadystatechange = function() {
    if (xmlHttp.readyState == 4 && xmlHttp.status == 200)
      callback(xmlHttp.responseText);
  };
  xmlHttp.open("GET", theUrl, true); // true for asynchronous
  xmlHttp.send(null);
}


/*

Tag list
--------

Opens and closes the long list of tags
on the template's index page.

*/

var tagToggle = document.getElementById("opentags");

if (tagToggle)
  tagToggle.onclick = function(e) {
    if (document.getElementById("tags").className.indexOf("open") > -1) {
      document.getElementById("tags").className = document
        .getElementById("tags")
        .className.replace("open", "");
    } else {
      document.getElementById("tags").className += " open";
    }
    e.preventDefault();
    return false;
  };





/*

Relative dates
--------------

This function maps entry dates to relative values
e.g. December 11th 2018 -> 2 minutes ago

*/

var relativeDate = (function(undefined) {
  var SECOND = 1000,
    MINUTE = 60 * SECOND,
    HOUR = 60 * MINUTE,
    DAY = 24 * HOUR,
    WEEK = 7 * DAY,
    YEAR = DAY * 365,
    MONTH = YEAR / 12;

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

  function relativeDate(input, reference) {
    !reference && (reference = new Date().getTime());
    reference instanceof Date && (reference = reference.getTime());
    input instanceof Date && (input = input.getTime());

    var delta = reference - input,
      format,
      i,
      len;

    for (i = -1, len = formats.length; ++i < len; ) {
      format = formats[i];
      if (delta < format[0]) {
        return format[2] === undefined
          ? format[1]
          : Math.round(delta / format[2]) + " " + format[1];
      }
    }
  }

  return relativeDate;
})();

var dates = document.querySelectorAll("[date-from-now]");

dates.forEach(function(el) {
  var dateStamp = parseInt(el.getAttribute("date-from-now"));
  if (isNaN(dateStamp)) return; // No date parsed
  if (Date.now() - dateStamp > 1000 * 60 * 60 * 24 * 30 * 3) return; // Date too old
  var new_str = relativeDate(new Date(dateStamp));
  el.innerHTML = new_str;
});


/*

Pagination
----------

Generates a list of links like this:

[1] [2] [3] [4] [5]

With optional settings to limit the number of numbers.
Centers around the current link where possible.
Would be nice to do this on the server, too.

*/

document.querySelectorAll(".paginator .numbers").forEach(function(el) {
  var current = parseInt(el.getAttribute("data-current"));
  var total = parseInt(el.getAttribute("data-total"));
  var start = 1;
  var limit;

  if (el.getAttribute("data-limit")) {
    start = current - Math.floor(parseInt(el.getAttribute("data-limit")) / 2);
    if (start < 1) start = 1;
    limit = start + parseInt(el.getAttribute("data-limit")) - 1;
  } else {
    limit = total;
  }

  if (limit > total) limit = total;

  for (var i = start; i <= limit; i++)
    el.innerHTML +=
      '<a href="/page/' +
      i +
      '" class="' +
      (i === current) +
      '" id="number-template">' +
      i +
      "</a> ";
});
