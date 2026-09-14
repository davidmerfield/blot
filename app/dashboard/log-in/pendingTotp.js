// A password (or magic link) has been verified but a second factor is still
// outstanding. Tracked with a timestamp so an abandoned or later-stolen
// pre-authentication session can't be completed with just a current code
// weeks later -- dashboard sessions otherwise last 30 days.
var TTL_MS = 10 * 60 * 1000;

module.exports = {
  set: function (req, uid, then) {
    // The request that reaches here proves the password/token, not the
    // second factor -- any existing authenticated session must not let the
    // log-in router's "already signed in" guard skip the challenge below.
    delete req.session.uid;

    req.session.pendingTotp = { uid: uid, then: then, createdAt: Date.now() };
  },

  get: function (req) {
    var pending = req.session.pendingTotp;

    if (!pending) return null;

    if (Date.now() - pending.createdAt > TTL_MS) {
      delete req.session.pendingTotp;
      return null;
    }

    return pending;
  },

  clear: function (req) {
    delete req.session.pendingTotp;
  }
};
