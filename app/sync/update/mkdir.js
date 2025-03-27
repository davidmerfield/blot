// Since the Dropbox client tells us about empty directories
// we store the case sensitive name of them for use on the
// dashboard. This is a little redundant but oh well. Git
// does not care about empty directories...
module.exports = function (blogID, path, options, callback) {
  // If there's no case-sensitive name to store then we
  // have literally nothing to do about an empty directory...
  callback(null);
};
