var debug = require("debug")("blot:build:prepare:internalLinks");

// The purpose of this module is to take the HTML for
// a given blog post and work out if any of the links
// inside refer to other pages on the site.
function internalLinks($) {
	var result = [];

	$("[href]").each(function () {
		let value = $(this).attr("href");
		let normalizedValue = value;

		if (value.indexOf("/") !== 0) return;

		normalizedValue = normalizedValue.split("#")[0].split("?")[0];

		if (!normalizedValue || result.indexOf(normalizedValue) > -1) return;

		result.push(normalizedValue);
	});

	debug(result);
	return result;
}

module.exports = internalLinks;
