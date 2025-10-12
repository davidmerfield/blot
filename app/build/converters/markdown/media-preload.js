module.exports = function (html) {
  let changed = false;

  const result = html.replace(
    /<(audio|video)([^>]*?)(\/?)>/gi,
    (match, tag, attrs = "", selfClosing = "") => {
      if (/\bpreload\s*=/i.test(attrs)) return match;

      changed = true;

      // The HTML standard defaults <audio>/<video> preload to "auto" which
      // instructs the browser to fetch the entire file up-front. Adding
      // preload="metadata" keeps the initial request limited to headers so the
      // browser only loads what it needs to render the player chrome. See
      // https://html.spec.whatwg.org/multipage/media.html#attr-media-preload.

      const trimmedAttrs = attrs.replace(/\s+$/, "");
      const prefix = `<${tag}${trimmedAttrs}`;
      const separator = " ";
      const closing = selfClosing ? " />" : ">";

      return `${prefix}${separator}preload="metadata"${closing}`;
    }
  );

  return changed ? result : html;
};
