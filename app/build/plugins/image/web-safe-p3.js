var HDR_PROFILE_MARKERS = [/smpte\s*st\s*2084/i, /pq\s*(transfer|curve)?/i];
var DISPLAY_P3_PROFILE_BASE64 =
  "AAACJGFwcGwEAAAAbW50clJHQiBYWVogB98ACgAOAA0ACAA5YWNzcEFQUEwAAAAAQVBQTAAAAAAAAAAAAAAAAAAAAAAAAPbW" +
  "AAEAAAAA0y1hcHBs5bsOmGe9Rs1LvkRuvRt1mAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAKZGVzYwAAAPwAAABl" +
  "Y3BydAAAAWQAAAAjd3RwdAAAAYgAAAAUclhZWgAAAZwAAAAUZ1hZWgAAAbAAAAAUYlhZWgAAAcQAAAAUclRSQwAAAdgAAAAg" +
  "Y2hhZAAAAfgAAAAsYlRSQwAAAdgAAAAgZ1RSQwAAAdgAAAAgZGVzYwAAAAAAAAALRGlzcGxheSBQUQAAAAAAAAAAAAAAAAAA" +
  "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAB0ZXh0" +
  "AAAAAENvcHlyaWdodCBBcHBsZSBJbmMuLCAyMDE1AABYWVogAAAAAAAA81EAAQAAAAEWzFhZWiAAAAAAAACD3wAAPb////+7" +
  "WFlaIAAAAAAAAEq/AACxNwAACrlYWVogAAAAAAAAKDgAABELAADIuXBhcmEAAAAAAAMAAAACZmYAAPKwAAANUAAAE7YAAAn8" +
  "c2YzMgAAAAAAAQxCAAAF3v//8yYAAAeTAAD9kP//+6L///2jAAAD3AAAwG4=";

function getDisplayP3ProfileBuffer() {
  return Buffer.from(DISPLAY_P3_PROFILE_BASE64, "base64");
}

module.exports = function ensureWebSafeP3(image, metadata) {
  if (!metadata || !metadata.icc) {
    return image.keepIccProfile();
  }

  var profileText = metadata.icc.toString("ascii").replace(/\u0000/g, " ");

  if (
    HDR_PROFILE_MARKERS.some(function (regex) {
      return regex.test(profileText);
    })
  ) {
    return image.toColorspace("p3").withMetadata({ icc: getDisplayP3ProfileBuffer() });
  }

  return image.keepIccProfile();
};

module.exports.getDisplayP3ProfileBuffer = getDisplayP3ProfileBuffer;
module.exports.isHdrDisplayP3 = function isHdrDisplayP3(metadata) {
  if (!metadata || !metadata.icc) return false;

  var profileText = metadata.icc.toString("ascii").replace(/\u0000/g, " ");

  return HDR_PROFILE_MARKERS.some(function (regex) {
    return regex.test(profileText);
  });
};
