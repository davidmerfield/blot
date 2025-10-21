const readdir = require("clients/google-drive/sync/util/driveReaddir");
const get = require("../get/blog");
const createDriveClient = require("clients/google-drive/serviceAccount/createDriveClient");
const database = require("clients/google-drive/database");

if (process.argv.length < 4) {
  console.log("Usage: node readdir.js <blogID> <path>");
  process.exit();
}

get(process.argv[2], async function (err, user, blog) {
  if (err) throw err;
  const account = await database.blog.get(blog.id);
  const { folderId, serviceAccountId } = account;

  const drive = await createDriveClient(serviceAccountId);
  const { getByPath } = database.folder(folderId);

  const dirId = await getByPath(process.argv[3]);
  const contents = await readdir(drive, dirId);
  console.log(contents);
  process.exit();
});
