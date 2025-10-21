module.exports = function transformDriveItems(files) {
  // First transform the items
  const transformed = files.map((f) => {
    if (f.mimeType === "application/vnd.google-apps.document") {
      f.name += ".gdoc";
    }

    f.size = Number(f.size);
    f.isDirectory = f.mimeType === "application/vnd.google-apps.folder";

    return f;
  });

  // Then dedupe the names
  const seen = new Set();
  return transformed.map((item) => {
    let name = item.name;
    let counter = 1;
    let base, ext;

    const dotIndex = name.lastIndexOf(".");
    if (dotIndex === -1) {
      base = name;
      ext = "";
    } else {
      base = name.substring(0, dotIndex);
      ext = name.substring(dotIndex);
    }

    while (seen.has(name)) {
      name = `${base} (${counter})${ext}`;
      counter++;
    }

    seen.add(name);
    item.name = name;
    return item;
  });
};
