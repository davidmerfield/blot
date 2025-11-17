module.exports = function desnake (str) {
  str = str.split("_").join(" ");
  str = str[0].toUpperCase() + str.slice(1);
  if (str.endsWith(" color")) str = str.slice(0, -" color".length);
  return str;
};
