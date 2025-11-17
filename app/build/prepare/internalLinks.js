var debug = require("debug")("blot:build:prepare:internalLinks");

// The purpose of this module is to take the HTML for
// a given blog post and work out if any of the links
// inside refer to other pages on the site.
function internalLinks($) {
	var result = [];

	$("[href]").each(function () {
		let value = $(this).attr("href");

		if (value.indexOf("/") !== 0 || result.indexOf(value) > -1) return;

		result.push(value);
	});

	debug(result);
	return result;
}

module.exports = internalLinks;
