var debug = require("debug")("blot:build:prepare:internalLinks");

// The purpose of this module is to take the HTML for
// a given blog post and work out if any of the links
// inside refer to other pages on the site.
//
// resolvedFileLinks (optional) is the list of absolute paths this
// entry's build resolved from a *relative* <a href>, e.g. a link to
// a sibling image, now rewritten to an absolute folder path. Those
// aren't links to other pages, so we exclude them here - otherwise
// a resolved file path that happens to collide with some other
// entry's custom permalink would be mistaken for a link to that
// entry and produce a spurious backlink. This deliberately doesn't
// exclude every entry.dependencies value - an href the author
// already wrote as absolute (e.g. a normal link to another post) is
// still a legitimate internal-link candidate, even though it's also
// tracked as a dependency.
function internalLinks($, resolvedFileLinks) {
	var result = [];

	resolvedFileLinks = resolvedFileLinks || [];

	$("[href]").each(function () {
		let value = $(this).attr("href");
		let normalizedValue = value;

		if (value.indexOf("/") !== 0) return;

		normalizedValue = normalizedValue.split("#")[0].split("?")[0];

		if (!normalizedValue || result.indexOf(normalizedValue) > -1) return;

		if (resolvedFileLinks.indexOf(normalizedValue) > -1) return;

		result.push(normalizedValue);
	});

	debug(result);
	return result;
}

module.exports = internalLinks;
