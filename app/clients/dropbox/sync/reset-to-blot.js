const fs = require("fs-extra");
const { promisify } = require("util");
const { join } = require("path");
const clfdate = require("helper/clfdate");
const localPath = require("helper/localPath");
const hashFile = promisify((path, cb) => {
  require("helper/hashFile")(path, (err, result) => {
    cb(null, result);
  });
});
const download = promisify(require("../util/download"));
const {
  MAX_FILE_SIZE,
  hasUnsupportedExtension,
  isDotfileOrDotfolder,
} = require("../util/constants");

const set = promisify(require("../database").set);
const createClient = promisify((blogID, cb) =>
  require("../util/createClient")(blogID, (err, ...results) => cb(err, results))
);

// const upload = promisify(require("clients/dropbox/util/upload"));
// const get = promisify(require("../database").get);

async function resetToBlot(blogID, publish) {
  if (!publish)
    publish = (...args) => {
      console.log(clfdate() + " Dropbox:", args.join(" "));
    };

  publish("Syncing folder from Dropbox to Blot");

  // if (signal.aborted) return;
  // // this could become verify.fromBlot
  // await uploadAllFiles(account, folder, signal);

  // if (signal.aborted) return;
  // const account = await get(blogID);
  const [client, account] = await createClient(blogID);

  let dropboxRoot = "/";

  // Load the path to the blog folder root position in Dropbox
  if (account.folder_id) {
    const { result } = await client.filesGetMetadata({
      path: account.folder_id,
    });
    const { path_display } = result;
    if (path_display) {
      dropboxRoot = path_display;
      await set(blogID, { folder: path_display });
    }
  }

  // It's import that these args match those used in delta.js
  // A way to quickly get a cursor for the folder's state.
  // From the docs:
  // https://dropbox.github.io/dropbox-sdk-js/Dropbox.html
  // Unlike list_folder, list_folder/get_latest_cursor doesn't
  // return any entries. This endpoint is for app which only
  // needs to know about new files and modifications and doesn't
  // need to know about files that already exist in Dropbox.
  // Route attributes: scope: files.metadata.read

  const {
    result: { cursor },
  } = await client.filesListFolderGetLatestCursor({
    path: account.folder_id || "",
    include_deleted: true,
    recursive: true,
  });

  // This means that future syncs will be fast
  await set(blogID, { cursor });

  await walk(blogID, client, publish, dropboxRoot, "/");

  await set(blogID, {
    error_code: 0,
    last_sync: Date.now(),
  });

  publish("Finished processing folder");
}

const walk = async (blogID, client, publish, dropboxRoot, dir) => {
  const localRoot = localPath(blogID, "/");
  publish("Checking", dir);
  const [remoteContents, localContents] = await Promise.all([
    remoteReaddir(client, join(dropboxRoot, dir)),
    localReaddir(blogID, localRoot, dir),
  ]);

  for (const { name, path_display } of localContents) {
    const remoteCounterpart = remoteContents.find(
      (remoteItem) => remoteItem.name === name
    );

    if (!remoteCounterpart) {
      publish("Removing", path_display);
      try {
        await fs.remove(join(localRoot, dir, name));
      } catch (e) {
        publish("Failed to remove", path_display, e.message);
      }
    }
  }

  for (const remoteItem of remoteContents) {
    const localCounterpart = localContents.find(
      (localItem) => localItem.name === remoteItem.name
    );

    const { path_display, name } = remoteItem;
    const pathOnDropbox = path_display;
    const pathOnBlot = join(dir, name);
    const pathOnDisk = join(localRoot, dir, name);

    if (isDotfileOrDotfolder(pathOnBlot)) continue;

    if (remoteItem.is_directory) {
      if (localCounterpart && !localCounterpart.is_directory) {
        publish("Removing", pathOnDisk);
        await fs.remove(pathOnDisk);
        publish("Creating directory", pathOnDisk);
        await fs.mkdir(pathOnDisk);
      } else if (!localCounterpart) {
        publish("Creating directory", pathOnBlot);
        await fs.mkdir(pathOnDisk);
      }

      await walk(blogID, client, publish, dropboxRoot, join(dir, name));
    } else {
      if (hasUnsupportedExtension(pathOnDropbox)) {
        publish("Skipping unsupported file", pathOnBlot);
        try {
          await fs.outputFile(pathOnDisk, "");
        } catch (err) {
          publish("Failed to create placeholder", pathOnBlot, err.message);
        }
        continue;
      }

      if (
        typeof remoteItem.size === "number" &&
        remoteItem.size > MAX_FILE_SIZE
      ) {
        publish(
          "Skipping oversized file",
          `${pathOnBlot} (${remoteItem.size} bytes > ${MAX_FILE_SIZE} byte limit)`
        );
        try {
          await fs.outputFile(pathOnDisk, "");
        } catch (err) {
          publish("Failed to create placeholder", pathOnBlot, err.message);
        }
        continue;
      }

      const identicalLocally =
        localCounterpart &&
        localCounterpart.content_hash === remoteItem.content_hash;

      if (localCounterpart && !identicalLocally) {
        publish("Downloading", pathOnBlot);
        try {
          await download(client, pathOnDropbox, pathOnDisk);
        } catch (e) {
          continue;
        }
      } else if (!localCounterpart) {
        publish("Downloading", pathOnBlot);
        try {
          await download(client, pathOnDropbox, pathOnDisk);
        } catch (e) {
          continue;
        }
      }
    }
  }
};

const localReaddir = async (blogID, localRoot, dir) => {
  const contents = await fs.readdir(join(localRoot, dir));

  return Promise.all(
    contents.map(async (name) => {
      const pathOnDisk = join(localRoot, dir, name);
      const [content_hash, stat] = await Promise.all([
        hashFile(pathOnDisk),
        fs.stat(pathOnDisk),
      ]);

      return {
        name,
        path_display: join(dir, name),
        is_directory: stat.isDirectory(),
        content_hash,
      };
    })
  );
};

const remoteReaddir = async (client, dir) => {
  let items = [];
  let cursor;
  let has_more;

  //path: Specify the root folder as an empty string rather than as "/".'
  if (dir === "/") dir = "";

  do {
    const { result } = cursor
      ? await client.filesListFolderContinue({ cursor })
      : await client.filesListFolder({ path: dir });
    has_more = result.has_more;
    cursor = result.cursor;
    items = items.concat(
      result.entries.map((i) => {
        i.is_directory = i[".tag"] === "folder";
        return i;
      })
    );
  } while (has_more);

  return items;
};

module.exports = resetToBlot;
