var Tags = require("models/tags");

module.exports = function (req, res, callback) {
  req.log('Listing popular tags');
  
  // We could make this limit configurable through req.query or config
  const limit = 100;
  
  Tags.popular(req.blog.id, { limit: limit, offset: 0 }, function(err, tags) {
    if (err) return callback(err);

    // Map to match expected format
    req.log('Formatting popular tags');
    tags = tags.map((tag) => ({
      name: tag.name,
      tag: tag.name, // for backward compatibility
      entries: tag.entries,
      total: tag.count,
      slug: encodeURIComponent(tag.slug)
    }));

    req.log('Listed popular tags');
    callback(null, tags);
  });
};