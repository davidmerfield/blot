var Express = require("express");
var TwoFactor = new Express.Router();
var QRCode = require("qrcode");
var User = require("models/user");
var checkPassword = require("./util/checkPassword");

TwoFactor.route("/").get(function (req, res) {
  res.render("dashboard/account/two-factor", {
    breadcrumb: "Two-factor authentication",
    title: "Two-factor authentication",
  });
});

TwoFactor.route("/enable")

  .all(requireDisabled)

  .get(function (req, res) {
    res.render("dashboard/account/two-factor-enable", {
      title: "Set up two-factor authentication",
    });
  })

  .post(checkPassword, beginSetup);

TwoFactor.route("/enable/confirm")

  .all(requireDisabled)

  .get(function (req, res, next) {
    if (!req.session.pendingTotpSetupSecret) {
      return res.redirect(req.baseUrl + "/enable");
    }

    renderSetup(req, res, next);
  })

  .post(confirmSetup);

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

function requireEnabled(req, res, next) {
  if (!req.user.totpEnabled) return res.redirect(req.baseUrl);
  next();
}

function requireDisabled(req, res, next) {
  if (req.user.totpEnabled) return res.redirect(req.baseUrl);
  next();
}

function beginSetup(req, res, next) {
  var secret = User.generateTotpSecret();

  req.session.pendingTotpSetupSecret = secret;

  renderSetup(req, res, next);
}

function renderSetup(req, res, next) {
  var secret = req.session.pendingTotpSetupSecret;
  var keyUri = User.getTotpKeyUri(req.user.email, secret);

  QRCode.toDataURL(keyUri, function (err, qrCodeDataUrl) {
    if (err) return next(err);

    res.render("dashboard/account/two-factor-setup", {
      title: "Set up two-factor authentication",
      secret: secret,
      qrCodeDataUrl: qrCodeDataUrl,
    });
  });
}

function confirmSetup(req, res, next) {
  var secret = req.session.pendingTotpSetupSecret;

  if (!secret) return res.redirect(req.baseUrl + "/enable");

  if (!User.verifyTotpToken(secret, req.body.code)) {
    return next(new Error("That code was not correct. Please try again."));
  }

  User.enableTotp(req.user.uid, secret, function (err, backupCodes) {
    if (err) return next(err);

    delete req.session.pendingTotpSetupSecret;

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

    res.render("dashboard/account/two-factor-backup-codes", {
      title: "Your backup codes",
      codes: codes,
    });
  });
}

module.exports = TwoFactor;
