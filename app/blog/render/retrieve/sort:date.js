module.exports = function (req, res, callback) {
  return callback(null, function () {
    this.entries = this.entries.sort(function (a, b) {
      return a.dateStamp > b.dateStamp ? -1 : a.dateStamp < b.dateStamp ? 1 : 0;
    });

    return function (text, render) {
      return render(text);
    };
  });
};
