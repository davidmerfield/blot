module.exports = function Entry(init) {
  init = init || {};
  for (var i in init) this[i] = init[i];

  if (this.toc === undefined) this.toc = "";
};
