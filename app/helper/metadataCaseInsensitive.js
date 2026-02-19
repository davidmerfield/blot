module.exports = function metadataCaseInsensitive (metadata) {
  const view = {};

  Object.keys(metadata)
    .sort((a, b) => a.localeCompare(b))
    .forEach(key => {
      const lowered = String(key).toLowerCase();

      if (!(lowered in view)) {
        view[lowered] = metadata[key];
      }
    });

  return view;
};
