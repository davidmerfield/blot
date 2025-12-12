function aliasMetadata(metadata) {
  if (!metadata || typeof metadata !== "object") return metadata;

  if (Array.isArray(metadata)) {
    metadata.forEach(aliasMetadata);
    return metadata;
  }

  Object.keys(metadata).forEach(originalKey => {
    const value = metadata[originalKey];

    if (value && typeof value === "object") {
      aliasMetadata(value);
    }

    const aliasKey = originalKey.toLowerCase();

    if (aliasKey === originalKey) return;

    if (Object.prototype.hasOwnProperty.call(metadata, aliasKey)) return;

    Object.defineProperty(metadata, aliasKey, {
      enumerable: false,
      configurable: true,
      get() {
        return metadata[originalKey];
      },
      set(newValue) {
        metadata[originalKey] = newValue;
      }
    });
  });

  return metadata;
}

module.exports = aliasMetadata;
