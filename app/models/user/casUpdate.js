var client = require("models/client");
var key = require("./key");

// Shared compare-and-swap primitive for read-modify-write updates against
// a user's Redis record. Extracted from enableTotp/regenerateTotpBackupCodes/
// consumeTotpToken/consumeTotpBackupCode, which each hand-rolled this same
// read -> mutate copy -> conditional write pattern.
var commit = `
  if redis.call('GET', KEYS[1]) ~= ARGV[1] then return 0 end
  redis.call('SET', KEYS[1], ARGV[2])
  return 1
`;

// mutate(user) mutates `user` in place and returns:
//   - false: abort without writing; casUpdate resolves with false
//   - anything else (including undefined): proceed to write; casUpdate
//     resolves with that value, or true if undefined
//
// options:
//   - retries: max CAS attempts before giving up (default 1)
//   - conflictMessage: message for the ECONFLICT error thrown once every
//     attempt has lost the race (default: generic retry message)
//   - failClosed: resolve false instead of throwing once every attempt
//     has lost the race (default false)
//   - notFoundThrows: throw "No user" if the record doesn't exist, instead
//     of resolving false (default true)
module.exports = function casUpdate(uid, mutate, options, callback) {
  if (typeof options === "function") {
    callback = options;
    options = {};
  }

  options = options || {};
  var retries = options.retries || 1;
  var notFoundThrows =
    options.notFoundThrows === undefined ? true : options.notFoundThrows;

  (async function () {
    for (var attempt = 0; attempt < retries; attempt++) {
      var previous = await client.get(key.user(uid));

      if (!previous) {
        if (notFoundThrows) throw new Error("No user");
        return false;
      }

      var user = JSON.parse(previous);
      var result = mutate(user);

      if (result === false) return false;

      var status = await client.eval(commit, {
        keys: [key.user(uid)],
        arguments: [previous, JSON.stringify(user)]
      });

      if (status === 1) return result === undefined ? true : result;
    }

    if (options.failClosed) return false;

    var conflict = new Error(
      options.conflictMessage || "User changed too frequently; please retry"
    );
    conflict.code = "ECONFLICT";
    throw conflict;
  })().then(function (result) {
    callback(null, result);
  }, callback);
};
