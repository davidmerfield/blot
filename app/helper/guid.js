/**
 * @author Briguy37
 * @license MIT license
 * @link http://stackoverflow.com/questions/105034/create-guid-uuid-in-javascript
 **/

function generate() {
  var d = Date.now();

  //use high-precision timer if available
  if (process.hrtime && typeof process.hrtime === "function") {
    d += process.hrtime()[0];
  }

  var guid = "xxxxxxxxxxxx4xxxyxxxxxxxxxxxxxxx".replace(/[xy]/g, function (c) {
    var r = (d + Math.random() * 16) % 16 | 0;
    d = Math.floor(d / 16);
    return (c == "x" ? r : (r & 0x3) | 0x8).toString(16);
  });

  return guid;
}

module.exports = generate;
