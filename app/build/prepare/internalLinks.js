var debug = require("debug")("blot:build:prepare:internalLinks");
var BLOT_CDN_TOKEN = require("../../blog/render/replaceFolderLinks/cdnToken");

// The purpose of this module is to take the HTML for
// a given blog post and work out if any of the links
// inside refer to other pages on the site.
//
// KNOWN EDGE CASE (accepted, not solved): dependencies/index.js
// resolves a relative <a href> (e.g. a link to a sibling file) to an
// absolute path. If that resolved path happens to be identical to
// some other entry's custom permalink, it's indistinguishable here
// from a real link to that entry, and produces a spurious backlink.
// This requires an exact, coincidental collision between a resolved
// file path and someone's custom permalink - extraordinarily
// unlikely - and the worst case is one wrong entry in a backlinks
// list, not a broken link or lost data. See the matching comment in
// dependencies/index.js for more.
function internalLinks($, blogID) {
	var result = [];
	var bakedPrefix = blogID
		? BLOT_CDN_TOKEN + "/folder/v-"
		: null;

	$("[href]").each(function () {
		let value = $(this).attr("href");
		let normalizedValue = value;

		// app/build/plugins/folderAssets bakes hrefs that resolve to a real
		// file in the blog's folder into a %%BLOT_CDN%%-prefixed, versioned
		// URL before this runs. Recover the original absolute path so a
		// link that happens to collide with another entry's custom
		// permalink (the known edge case above) is still detected as a
		// backlink candidate, exactly as it would be if it hadn't been
		// baked.
		if (bakedPrefix && value.indexOf(bakedPrefix) === 0) {
			var marker = "/" + blogID;
			var markerIndex = value.indexOf(marker, bakedPrefix.length);

			if (markerIndex === -1) return;

			normalizedValue = value.slice(markerIndex + marker.length);
		} else if (value.indexOf("/") !== 0) {
			return;
		}

		normalizedValue = normalizedValue.split("#")[0].split("?")[0];

		if (!normalizedValue || normalizedValue.indexOf("/") !== 0) return;
		if (result.indexOf(normalizedValue) > -1) return;

		result.push(normalizedValue);
	});

	debug(result);
	return result;
}

module.exports = internalLinks;
