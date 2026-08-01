module.exports = function (result, callback) {
  var content = result.source.split("---")[2];

  result.content = content.trim();
  callback(null, result);
};
