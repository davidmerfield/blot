const fs = require("fs-extra");
const { promisify } = require("util");
// const upload = promisify(require("clients/dropbox/util/upload"));
const join = require("path").join;
const clfdate = require("helper/clfdate");
const localPath = require("helper/localPath");
const hashFile = promisify((path, cb) => {
  require("helper/hashFile")(path, (err, result) => {
    cb(null, result);
  });
});
const upload = promisify(require("../util/upload"));
const { isDotfileOrDotfolder } = require("../util/constants");
const set = promisify(require("../database").set);
const createClient = promisify((blogID, cb) =>
  require("../util/createClient")(blogID, (err, ...results) => cb(err, results))
);

const ABORT_ERROR_MESSAGE = "Dropbox reset aborted";

function abortIfRequested(signal) {
  if (signal && signal.aborted) {
    const error = new Error(ABORT_ERROR_MESSAGE);
    error.name = "AbortError";
    throw error;
  }
}

async function resetFromBlot(blogID, publish, signal) {
  if (!publish)
    publish = (...args) => {
      console.log(clfdate() + " Dropbox:", args.join(" "));
    };

  abortIfRequested(signal);

  // if (signal.aborted) return;
  // // this could become verify.fromBlot
  // await uploadAllFiles(account, folder, signal);

  // if (signal.aborted) return;
  // const account = await get(blogID);
  abortIfRequested(signal);

  const [client, account] = await createClient(blogID);

  abortIfRequested(signal);

  let dropboxRoot = "/";
  const localRoot = localPath(blogID, "/");

  // Load the path to the blog folder root position in Dropbox
  if (account.folder_id) {
    abortIfRequested(signal);

    const { result } = await client.filesGetMetadata({
      path: account.folder_id,
    });

    abortIfRequested(signal);
    const {  path_display } = result;
    if (path_display) {
      dropboxRoot = path_display;
      abortIfRequested(signal);
      await set(blogID, { folder: path_display });
      abortIfRequested(signal);
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
  abortIfRequested(signal);

  const {
    result: { cursor },
  } = await client.filesListFolderGetLatestCursor({
    path: account.folder_id || "",
    include_deleted: true,
    recursive: true,
  });

  abortIfRequested(signal);

  const walk = async (dir) => {
    abortIfRequested(signal);

    publish("Checking", dir);

    const [remoteContents, localContents] = await Promise.all([
      remoteReaddir(client, join(dropboxRoot, dir), signal),
      localReaddir(blogID, localRoot, dir, signal),
    ]);

    abortIfRequested(signal);

    for (const { name } of remoteContents) {
      abortIfRequested(signal);

      const path = join(dir, name);
      if (!localContents.find((localItem) => localItem.name === name)) {
        publish("Removing", path);
        try {
          abortIfRequested(signal);
          await client.filesDelete({ path: join(dropboxRoot, path) });
          abortIfRequested(signal);
        } catch (e) {
          publish("Failed to remove", path, e.message);
        }
      }
    }

    for (const localItem of localContents) {
      abortIfRequested(signal);

      const path = join(dir, localItem.name);
      const remoteCounterpart = remoteContents.find(
        (remoteItem) => remoteItem.name === localItem.name
      );

      if (isDotfileOrDotfolder(path)) continue;

      if (localItem.is_directory) {
        abortIfRequested(signal);

        if (remoteCounterpart && !remoteCounterpart.is_directory) {
          publish("Removing", path);
          abortIfRequested(signal);
          await client.filesDelete({ path: join(dropboxRoot, path) });
          abortIfRequested(signal);
          publish("Creating directory", path);
          abortIfRequested(signal);
          await client.filesCreateFolder({
            path: join(dropboxRoot, path),
            autorename: false,
          });
          abortIfRequested(signal);
        } else if (!remoteCounterpart) {
          publish("Creating directory", path);
          abortIfRequested(signal);
          await client.filesCreateFolder({
            path: join(dropboxRoot, path),
            autorename: false,
          });
          abortIfRequested(signal);
        }

        await walk(path);

        abortIfRequested(signal);
      } else {
        const identicalOnRemote =
          remoteCounterpart &&
          remoteCounterpart.content_hash === localItem.content_hash;

        if (remoteCounterpart && !identicalOnRemote) {
          publish("Transferring", path);
          try {
            abortIfRequested(signal);
            await upload(
              client,
              join(localRoot, localItem.path_display),
              join(dropboxRoot, path)
            );
            abortIfRequested(signal);
          } catch (e) {
            publish("Failed to transfer", path);
          }
        } else if (!remoteCounterpart) {
          publish("Transferring", path);
          try {
            abortIfRequested(signal);
            await upload(
              client,
              join(localRoot, localItem.path_display),
              join(dropboxRoot, path)
            );
            abortIfRequested(signal);
          } catch (e) {
            publish("Failed to transfer", path);
          }
        }
      }
    }
  };

  await walk("/");

  abortIfRequested(signal);

  // Because we fetch the cursor before making any changes,
  // we will recieve webhook notifications for the files we
  // write and then we'll resync them.

  abortIfRequested(signal);

  await set(blogID, {
    error_code: 0,
    cursor,
    last_sync: Date.now(),
  });

  abortIfRequested(signal);

  publish("Finished processing folder");

  // reset sync cursor
  // await set(blogID, {cursor: ''});

  // return account;
}

// async function uploadAllFiles(account, folder, signal, dir = "/") {
//   if (signal.aborted) return;

//   const items = await fs.readdir(localPath(account.blog.id, dir));

//   for (const item of items) {
//     if (signal.aborted) return;
//     const stat = await fs.stat(localPath(account.blog.id, join(dir, item)));
//     if (stat.isDirectory()) {
//       await uploadAllFiles(account, folder, signal, join(dir, item));
//     } else {
//       folder.status("Transferring " + join(dir, item));
//       const source = localPath(account.blog.id, join(dir, item));
//       const destination = join(account.folder, dir, item);

//       try {
//         await upload(account.client, source, destination);
//       } catch (err) {
//         const { status, error } = err;
//         if (
//           status === 409 &&
//           error.error_summary.startsWith("path/disallowed_name")
//         ) {
//           continue;
//         } else {
//           console.log("here,", status, error);
//           throw err;
//         }
//       }
//     }
//   }
// }

const localReaddir = async (blogID, localRoot, dir, signal) => {
  abortIfRequested(signal);

  const contents = await fs.readdir(join(localRoot, dir));

  abortIfRequested(signal);

  return Promise.all(
    contents.map(async (name) => {
      abortIfRequested(signal);

      const pathOnDisk = join(localRoot, dir, name);
      const [content_hash, stat] = await Promise.all([
        hashFile(pathOnDisk),
        fs.stat(pathOnDisk),
      ]);

      abortIfRequested(signal);

      return {
        name,
        path_display: join(dir, name),
        is_directory: stat.isDirectory(),
        content_hash,
      };
    })
  );
};

const remoteReaddir = async (client, dir, signal) => {
  abortIfRequested(signal);

  let items = [];
  let cursor;
  let has_more;

  //path: Specify the root folder as an empty string rather than as "/".'
  if (dir === "/") dir = "";

  do {
    abortIfRequested(signal);

    const { result } = cursor
      ? await client.filesListFolderContinue({ cursor })
      : await client.filesListFolder({ path: dir });

    abortIfRequested(signal);

    has_more = result.has_more;
    cursor = result.cursor;
    items = items.concat(
      result.entries.map((i) => {
        i.is_directory = i[".tag"] === "folder";
        return i;
      })
    );
  } while (has_more);

  abortIfRequested(signal);

  return items;
};

module.exports = resetFromBlot;
