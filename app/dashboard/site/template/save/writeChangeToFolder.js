const { getMetadata, writeToFolder } = require("models/template");

module.exports = function (blog, template, view, callback) {
  const ensureMetadata = (metadata) => {
    if (!metadata || !metadata.localEditing) {
      return callback();
    }

    writeToFolder(blog.id, metadata.id || template.id, callback);
  };

  if (template && template.localEditing) {
    return ensureMetadata(template);
  }

  getMetadata(template.id, function (err, metadata) {
    if (err) return callback(err);
    ensureMetadata(metadata || template);
  });
};
