module.exports = function metadataCaseInsensitive (metadata) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return {};
  }

  const view = {};

  Object.keys(metadata)
    .sort((a, b) => a.localeCompare(b))
    .forEach(key => {
      const lowered = String(key).toLowerCase();

      if (!Object.prototype.hasOwnProperty.call(view, lowered)) {
        view[lowered] = metadata[key];
      }
    });

  return view;
};
