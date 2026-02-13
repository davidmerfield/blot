function lexKey(blogID) {
  return "blog:" + blogID + ":entries:lex";
}

function readyKey(blogID) {
  return "blog:" + blogID + ":entries:lex:ready";
}

module.exports = {
  lexKey: lexKey,
  readyKey: readyKey,
};
