const fs = require("fs-extra");
const { join } = require("path");
const localPath = require("helper/localPath");
const clfdate = require("helper/clfdate");
const database = require("../database");
const createDriveClient = require("../serviceAccount/createDriveClient");
const CheckWeCanContinue = require("../util/checkWeCanContinue");
const driveReaddir = require("./util/driveReaddir");
const localReaddir = require("./util/localReaddir");

const truncateToSecond = require("./util/truncateToSecond");

module.exports = async (blogID, publish) => {
  if (!publish)
    publish = (...args) => {
      console.log(clfdate() + " Google Drive:", args.join(" "));
    };

  const account = await database.blog.get(blogID);
  const { folderId, serviceAccountId } = account;
  const drive = await createDriveClient(serviceAccountId);
  const checkWeCanContinue = CheckWeCanContinue(blogID, account);
  const { reset, set } = database.folder(folderId);

  // reset db.folder state
  await reset();

  const walk = async (dir, dirId) => {
    publish("Checking", dir);

    const [remoteContents, localContents] = await Promise.all([
      driveReaddir(drive, dirId),
      localReaddir(localPath(blogID, dir)),
    ]);

    // Since we reset the database of file ids
    // we need to restore this now
    set(dirId, dir, { isDirectory: true });

    for (const { name, id } of remoteContents) {
      if (!localContents.find((item) => item.name === name)) {
        await checkWeCanContinue();
        publish("Removing", join(dir, name));
        await drive.files.delete({ fileId: id, supportsAllDrives: true });
      }
    }

    for (const { name, isDirectory, modifiedTime, size } of localContents) {
      const path = join(dir, name);
      const existsOnRemote = remoteContents.find((f) => f.name === name);

      if (isDirectory) {
        let pathId;

        if (
          existsOnRemote &&
          existsOnRemote.mimeType !== "application/vnd.google-apps.folder"
        ) {
          await checkWeCanContinue();
          publish("Removing", path);
          await drive.files.delete({
            fileId: existsOnRemote.id,
            supportsAllDrives: true,
          });
          publish("Creating directory", path);
          pathId = await mkdir(drive, dirId, name);
        } else if (existsOnRemote && existsOnRemote.id) {
          pathId = existsOnRemote.id;
        } else {
          await checkWeCanContinue();
          publish("Creating directory", path);
          pathId = await mkdir(drive, dirId, name);
        }

        await walk(path, pathId);
      } else {
        // These do not have a md5Checksum so we fall
        // back to using the modifiedTime
        const isGoogleAppFile = name.endsWith(".gdoc");

        const identicalOnRemote =
          existsOnRemote &&
          (isGoogleAppFile
            ? truncateToSecond(existsOnRemote.modifiedTime) ===
              truncateToSecond(modifiedTime)
            : existsOnRemote.size === size);

        if (existsOnRemote && !identicalOnRemote) {
          await checkWeCanContinue();
          publish("Updating", path);
          set(existsOnRemote.id, path, {
            modifiedTime,
            isDirectory: false,
          });
          await drive.files.update({
            fileId: existsOnRemote.id,
            supportsAllDrives: true,
            media: {
              body: fs.createReadStream(localPath(blogID, path)),
            },
          });
        } else if (!existsOnRemote) {
          await checkWeCanContinue();
          publish("Transferring", path);
          const { data } = await drive.files.create({
            resource: {
              name,
              parents: [dirId],
            },
            supportsAllDrives: true,
            media: {
              body: fs.createReadStream(localPath(blogID, path)),
            },
            fields: "id",
          });
          set(data.id, path, { modifiedTime, isDirectory: false });
        }
      }
    }
  };

  await walk("/", folderId);
};

const mkdir = async (drive, parentId, name) => {
  const res = await drive.files.create({
    resource: {
      name,
      parents: [parentId],
      mimeType: "application/vnd.google-apps.folder",
    },
    supportsAllDrives: true,
    fields: "id, name",
  });

  return res.data.id;
};
