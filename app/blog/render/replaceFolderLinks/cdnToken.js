// Sentinel baked into CDN URLs in place of the real origin, wherever a URL
// might be produced once (at entry build time) or cached across requests
// (template CSS/JS output caching) rather than resolved fresh on every
// request. A single unconditional string-replace in middleware.js swaps
// this for the real, protocol-adjusted CDN origin immediately before the
// response is sent - so every baked/cached path converges on one place,
// and future CDN routing changes (white-labeling, same-host serving) only
// need to change that one resolution step.
module.exports = "%%BLOT_CDN%%";
