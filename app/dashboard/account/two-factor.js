var Express = require("express");
var TwoFactor = new Express.Router();
var QRCode = require("qrcode");
var User = require("models/user");
var checkPassword = require("./util/checkPassword");

// A password-confirmed setup secret is only good for this long. After that
// (or if the user navigates away), it must be re-authorized with the
// password again rather than sitting in the session indefinitely.
var SETUP_TTL_MS = 10 * 60 * 1000;

TwoFactor.route("/").get(function (req, res) {
  res.render("dashboard/account/two-factor", {
    breadcrumb: "Two-factor authentication",
    title: "Two-factor authentication",
  });
});

TwoFactor.route("/enable")

  .all(requirePassword, requireDisabled)

  .get(function (req, res) {
    res.render("dashboard/account/two-factor-enable", {
      title: "Set up two-factor authentication",
    });
  })

  .post(checkPassword, beginSetup);

TwoFactor.route("/enable/confirm")

  .all(requirePassword, requireDisabled)

  .get(function (req, res, next) {
    if (!getPendingSetupSecret(req)) {
      return res.redirect(req.baseUrl + "/enable");
    }

    renderSetup(req, res, next);
  })

  .post(confirmSetup);

TwoFactor.get("/enable/cancel", function (req, res) {
  delete req.session.pendingTotpSetup;
  res.redirect(req.baseUrl);
});

TwoFactor.route("/disable")

  .all(requireEnabled)

  .get(function (req, res) {
    res.render("dashboard/account/two-factor-disable", {
      title: "Turn off two-factor authentication",
    });
  })

  .post(checkPassword, disable);

TwoFactor.route("/backup-codes")

  .all(requireEnabled)

  .get(function (req, res) {
    res.render("dashboard/account/two-factor-backup-codes-form", {
      title: "Regenerate backup codes",
    });
  })

  .post(checkPassword, regenerateBackupCodes);

// Two-factor setup relies on re-entering the account password, which
// passwordless accounts can never satisfy -- send them to set one first.
function requirePassword(req, res, next) {
  if (!req.user.hasPassword) return res.redirect("/sites/account/password/set");
  next();
}

function requireEnabled(req, res, next) {
  if (!req.user.totpEnabled) return res.redirect(req.baseUrl);
  next();
}

function requireDisabled(req, res, next) {
  if (req.user.totpEnabled) return res.redirect(req.baseUrl);
  next();
}

function getPendingSetupSecret(req) {
  var pending = req.session.pendingTotpSetup;

  if (!pending) return null;

  if (Date.now() - pending.createdAt > SETUP_TTL_MS) {
    delete req.session.pendingTotpSetup;
    return null;
  }

  return User.decryptTotpSecret(pending.secret);
}

function beginSetup(req, res, next) {
  // Encrypted at rest the same way the confirmed secret is once it's
  // written to the user record -- the session is Redis-backed too, and a
  // read or snapshot of it during enrollment shouldn't hand over a working
  // authenticator seed in plaintext.
  req.session.pendingTotpSetup = {
    secret: User.encryptTotpSecret(User.generateTotpSecret()),
    createdAt: Date.now(),
  };

  renderSetup(req, res, next);
}

function renderSetup(req, res, next) {
  var secret = getPendingSetupSecret(req);
  var keyUri = User.getTotpKeyUri(req.user.email, secret);

  QRCode.toDataURL(keyUri, function (err, qrCodeDataUrl) {
    if (err) return next(err);

    // This page displays the reusable secret itself -- never let it sit in
    // a shared/history cache after the session value that guards it is gone.
    res.set("Cache-Control", "no-store");

    res.render("dashboard/account/two-factor-setup", {
      title: "Set up two-factor authentication",
      secret: secret,
      qrCodeDataUrl: qrCodeDataUrl,
    });
  });
}

function confirmSetup(req, res, next) {
  var secret = getPendingSetupSecret(req);

  if (!secret) return res.redirect(req.baseUrl + "/enable");

  if (!User.verifyTotpToken(secret, req.body.code)) {
    return next(new Error("That code was not correct. Please try again."));
  }

  User.enableTotp(req.user.uid, secret, function (err, backupCodes) {
    if (err) return next(err);

    delete req.session.pendingTotpSetup;

    res.set("Cache-Control", "no-store");

    res.render("dashboard/account/two-factor-backup-codes", {
      title: "Your backup codes",
      codes: backupCodes,
      justEnabled: true,
    });
  });
}

function disable(req, res, next) {
  User.disableTotp(req.user.uid, function (err) {
    if (err) return next(err);
    res.message(req.baseUrl, "Turned off two-factor authentication");
  });
}

function regenerateBackupCodes(req, res, next) {
  User.regenerateTotpBackupCodes(req.user.uid, function (err, codes) {
    if (err) return next(err);

    res.set("Cache-Control", "no-store");

    res.render("dashboard/account/two-factor-backup-codes", {
      title: "Your backup codes",
      codes: codes,
    });
  });
}

module.exports = TwoFactor;
