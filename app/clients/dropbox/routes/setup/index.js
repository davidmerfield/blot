const sync = require("sync");
const redis = require("models/redis");

const promisify = require("util").promisify;
const database = require("clients/dropbox/database");
const set = promisify(database.set);

const getAccount = require("./getAccount");
const createFolder = require("./createFolder");
const resetFromBlot = require("../../sync/reset-from-blot");

function setup(account, session, callback) {
  sync(account.blog.id, async function (err, folder, done) {
    if (err) return callback(err);

    const client = new redis();
    const signal = { aborted: false };
    let abortHandled = false;
    let cleaned = false;
    let finished = false;

    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      console.log("Cleaning up Dropbox setup");
      try {
        delete session.dropbox;
        session.save();
        client.unsubscribe();
        client.quit();
      } catch (e) {
        if (e && e.code === "NR_CLOSED") {
          console.log("Redis connection already closed during cleanup:", e);
          return;
        }
        console.log("Error cleaning up:", e);
      }
    };

    const finish = (err) => {
      if (finished) return;
      finished = true;
      cleanup();
      done(err, callback);
    };

    client.subscribe("sync:status:" + account.blog.id);

    client.on("message", function (channel, message) {
      if (message !== "Attempting to disconnect from Dropbox") return;
      signal.aborted = true;
      abortHandled = true;
      finish(new Error("Dropbox setup aborted"));
    });

    try {
      folder.status("Loading Dropbox account");
      account = await getAccount(account);
      if (signal.aborted) return;
      session.save();

      folder.status("Creating folder in Dropbox");
      account = await createFolder(account, signal);
      if (signal.aborted) return;
      session.save();

      await set(account.blog.id, {
        account_id: account.account_id,
        email: account.email,
        access_token: account.access_token,
        refresh_token: account.refresh_token,
        full_access: account.full_access,
        folder: account.folder,
        folder_id: account.folder_id,
        error_code: 0,
        last_sync: Date.now(),
        cursor: "",
      });

      folder.status("Syncing your folder to Dropbox");
      if (signal.aborted) return;

      // upload folder contents to dropbox
      // todo: pass in signal
      await resetFromBlot(account.blog.id, folder.status, signal);

      if (signal.aborted) return;
    } catch (err) {
      if (err && err.name === "AbortError") {
        folder.status("Dropbox setup aborted");
        if (abortHandled) return;
        cleanup();
        return done(err, callback);
      }

      folder.status("Error: " + err.message);
      return finish(err);
    }

    finish(null);
  });
}

module.exports = setup;
