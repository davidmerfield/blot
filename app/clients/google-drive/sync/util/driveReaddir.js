const readdir = async (drive, dirId) => {
  let res;
  let items = [];
  let nextPageToken;

  do {
    const params = {
      q: `'${dirId}' in parents and trashed = false`,
      pageToken: nextPageToken,
      fields:
        "nextPageToken, files/id, files/name, files/modifiedTime, files/md5Checksum, files/mimeType, files/size",
    };
    res = await drive.files.list(params);
    items = items.concat(res.data.files);
    nextPageToken = res.data.nextPageToken;
  } while (nextPageToken);

  // Filter out dotfiles and dotfolders - they won't be synced to Blot
  return items.filter((item) => !item.name.startsWith("."));
};

module.exports = readdir;
