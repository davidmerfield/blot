var retry = require("clients/dropbox/util/retry");
var createClient = require("clients/dropbox/util/createClient");

function remove(done) {
  var client = createClient(process.env.BLOT_DROPBOX_TEST_ACCOUNT_APP_TOKEN);

  function checkBatchStatus(result) {
    return client.filesDeleteBatchCheck(result).then(function (res) {
      switch (res[".tag"]) {
        case "in_progress":
          return checkBatchStatus(result);
        case "complete":
          return Promise.resolve(res);
        default:
          return Promise.reject(new Error("Unknown response " + res));
      }
    });
  }

  function removeAllFiles(res) {
    return client.filesDeleteBatch({
      entries: res.entries.map(function (entry) {
        return { path: entry.path_display };
      }),
    });
  }

  client
    .filesListFolder({ path: "" })
    .then(removeAllFiles)
    .then(checkBatchStatus)
    .then(function (res) {
      if (
        res.entries.some(function (entry) {
          return entry[".tag"] !== "success";
        })
      ) {
        remove(done);
      } else {
        done();
      }
    })
    .catch(function (err) {
      if (err instanceof Error) {
        done(err);
      } else {
        done(new Error(err));
      }
    });
}

module.exports = retry(remove);
