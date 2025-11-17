const database = require("../../database");
const initialTransfer = require("../../sync/initialTransfer");
module.exports = async function (req, res) {
  const blogID = req.header("blogID");
  const status = req.body;

  res.send("ok");

  try {
    // store the status in the database
    await database.store(blogID, status);

    // run when the macserver has successfully recieved the sharing link
    // and created the folder
    if (status.acceptedSharingLink) {
        console.log("Initial transfer started");
        initialTransfer(blogID);
    } else {
      folder.status("Sync update from iCloud");
      console.log("Sync update from iCloud", status);
      folder.status("Sync complete");
    }
  } catch (err) {
    console.log("Error in /status", err);
  }
};
