module.exports = function (req, res, callback) {
  return callback(null, function () {
    this.entries = this.entries.sort(function (a, b) {
      var textA = a.path.toUpperCase();
      var textB = b.path.toUpperCase();

      return textA < textB ? -1 : textA > textB ? 1 : 0;
    });

    return function (text, render) {
      return render(text);
    };
  });
};
