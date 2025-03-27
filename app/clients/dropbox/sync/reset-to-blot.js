const fs = require("fs-extra");
const { promisify } = require("util");
const { join, basename } = require("path");
const clfdate = require("helper/clfdate");
const localPath = require("helper/localPath");
const lowerCaseContents = require("sync/lowerCaseContents");
const hashFile = promisify((path, cb) => {
  require("helper/hashFile")(path, (err, result) => {
    cb(null, result);
  });
});
const download = promisify(require("../util/download"));

const getMetadata = promisify(require("models/metadata").get);
const addMetadata = promisify(require("models/metadata").add);
const dropMetadata = promisify(require("models/metadata").drop);

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
    const { path_lower, path_display } = result;
    if (path_lower) {
      dropboxRoot = path_lower;
      await set(blogID, { folder: path_display });
    }
  }

  publish("Checking the case of files within your folder");
  await lowerCaseContents(blogID);

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

  for (const { name, path_lower } of localContents) {
    const remoteCounterpart = remoteContents.find(
      (remoteItem) => remoteItem.name === name
    );

    if (!remoteCounterpart) {
      publish("Removing", path_lower);
      try {
        await dropMetadata(blogID, path_lower);
        await fs.remove(join(localRoot, path_lower));
      } catch (e) {
        publish("Failed to remove", path_lower, e.message);
      }
    }
  }

  for (const remoteItem of remoteContents) {
    // Name can be casey, path_lower is not
    const localCounterpart = localContents.find(
      (localItem) => localItem.name === remoteItem.name
    );

    const { path_lower, name } = remoteItem;
    const pathOnDropbox = path_lower;
    const pathOnBlot =
      dropboxRoot === "/" ? path_lower : path_lower.slice(dropboxRoot.length);
    const pathOnDisk = join(localRoot, pathOnBlot);

    // We preserve the name of the file with case
    // in the database here or we remove it
    // to prevent vestigal names of the file in DB
    if (name !== basename(path_lower)) {
      publish("Storing metadata", name, "for", pathOnBlot);
      await addMetadata(blogID, pathOnBlot, name);
    } else {
      publish("Removing metadata for", pathOnBlot);
      await dropMetadata(blogID, pathOnBlot);
    }

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
  // The Dropbox client stores all items in lowercase
  const contents = await fs.readdir(join(localRoot, dir));

  return Promise.all(
    contents.map(async (name) => {
      const pathOnDisk = join(localRoot, dir, name);
      const pathInDB = join(dir, name);
      const [content_hash, stat, displayName] = await Promise.all([
        hashFile(pathOnDisk),
        fs.stat(pathOnDisk),
        getMetadata(blogID, pathInDB),
      ]);

      return {
        name: displayName || name,
        path_lower: join(dir, name),
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
