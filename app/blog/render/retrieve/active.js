module.exports = function (req, res, callback) {
  return callback(null, function () {
    var url;
    var link;

    try {
      url = decodeURI(req.url);
      link = this.url;

      // it's neccessary to decodeURI
      // in order for tag slugs with accents to work
      if (!link && this.slug) link = "/tagged/" + decodeURIComponent(this.slug);

      url = url.trim();
      link = link.trim();
    } catch (e) {
      return false;
    }

    var active = "";

    if (link === url) active = "active";

    return active;
  });
};
