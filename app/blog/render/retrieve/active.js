function canonicalize(url) {
  var segments = url.split("/").map(function (segment) {
    return decodeURIComponent(segment);
  });

  // Match the previous behavior, which trimmed after decoding the URL.
  segments[0] = segments[0].trimStart();
  segments[segments.length - 1] = segments[segments.length - 1].trimEnd();

  // Decode and re-encode each path segment independently. In particular, this
  // keeps an encoded slash inside a tag slug rather than turning it into a path
  // separator.
  return segments.map(encodeURIComponent).join("/");
}

module.exports = function (req, res, callback) {
  return callback(null, function () {
    var url;
    var link;

    try {
      url = req.url;
      link = this.url;

      if (!link && this.slug) link = "/tagged/" + this.slug;

      url = canonicalize(url);
      link = canonicalize(link);
    } catch (e) {
      return false;
    }

    var active = "";

    if (link === url) active = "active";

    return active;
  });
};
