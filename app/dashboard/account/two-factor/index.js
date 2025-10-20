const Express = require("express");
const qrcode = require("qrcode");
const { authenticator } = require("otplib");

const User = require("models/user");

const TwoFactor = User.twoFactor;

const router = new Express.Router();

function getSetup(req) {
  if (!req.session) return null;
  return req.session.twoFactorSetup || null;
}

function clearSetup(req) {
  if (req.session) {
    delete req.session.twoFactorSetup;
  }
}

function guardCodes(req, res, next) {
  if (!req.session || !req.session.showTwoFactorCodes) {
    return res.redirect(req.baseUrl);
  }

  next();
}

router.use((req, res, next) => {
  res.locals.title = "Two-factor authentication";
  next();
});

router.get("/", (req, res) => {
  res.render("dashboard/account/two-factor/index", {
    twoFactor: req.user.twoFactor,
    twoFactorEnabled: req.user.twoFactorEnabled,
  });
});

router.post("/start", (req, res, next) => {
  if (req.user.twoFactorEnabled) {
    return res.message(
      req.baseUrl,
      new Error("Two-factor authentication is already enabled")
    );
  }

  const secret = TwoFactor.generateSecret();
  const backupCodes = TwoFactor.generateBackupCodes();

  if (!req.session) {
    return next(new Error("Session is required to configure two-factor"));
  }

  req.session.twoFactorSetup = {
    secret,
    backupCodes,
    otpauth: authenticator.keyuri(req.user.email, "Blot", secret),
    createdAt: Date.now(),
  };

  res.redirect(req.baseUrl + "/enable");
});

router.get("/enable", async (req, res, next) => {
  const setup = getSetup(req);

  if (!setup || !setup.secret) {
    return res.redirect(req.baseUrl);
  }

  const reveal = req.session && req.session.showTwoFactorSecret;
  if (req.session) delete req.session.showTwoFactorSecret;

  try {
    res.render("dashboard/account/two-factor/enable", {
      qr: await qrcode.toDataURL(setup.otpauth),
      maskedSecret: TwoFactor.maskSecret(setup.secret),
      email: req.user.email,
      secret: reveal ? setup.secret : null,
    });
  } catch (err) {
    next(err);
  }
});

router.post("/confirm", (req, res, next) => {
  const setup = getSetup(req);

  if (!setup || !setup.secret) {
    return res.message(req.baseUrl, new Error("Start setup again"));
  }

  const code = req.body && req.body.code;

  if (!code) {
    return res.message(
      req.baseUrl + "/enable",
      new Error("Enter the code from your authenticator app")
    );
  }

  if (!TwoFactor.verifyWithSecret(setup.secret, code)) {
    return res.message(
      req.baseUrl + "/enable",
      new Error("That two-factor code was not valid")
    );
  }

  TwoFactor.enable(
    req.user.uid,
    { secret: setup.secret, backupCodes: setup.backupCodes },
    function (err) {
      if (err) return next(err);

      if (req.session) {
        req.session.showTwoFactorCodes = true;
        req.session.twoFactorCodes = setup.backupCodes;
      }

      clearSetup(req);

      res.message(
        req.baseUrl + "/codes",
        "Two-factor authentication enabled"
      );
    }
  );
});

router.post("/enable/reveal", (req, res) => {
  const setup = getSetup(req);

  if (!setup || !setup.secret) {
    return res.message(req.baseUrl, new Error("Start setup again"));
  }

  if (req.session) {
    req.session.showTwoFactorSecret = true;
  }

  res.redirect(req.baseUrl + "/enable");
});

router.post("/codes", (req, res, next) => {
  User.getById(req.user.uid, function (err, user) {
    if (err) return next(err);

    if (!user || !user.twoFactor || !user.twoFactor.enabled) {
      return res.message(req.baseUrl, new Error("Two-factor is not enabled"));
    }

    if (req.session) {
      req.session.showTwoFactorCodes = true;
      req.session.twoFactorCodes = user.twoFactor.backupCodes || [];
    }

    res.redirect(req.baseUrl + "/codes");
  });
});

router.get("/codes", guardCodes, (req, res) => {
  const codes = (req.session && req.session.twoFactorCodes) || [];

  if (req.session) {
    delete req.session.twoFactorCodes;
    delete req.session.showTwoFactorCodes;
  }

  res.render("dashboard/account/two-factor/codes", {
    codes,
  });
});

router.post("/disable", (req, res, next) => {
  if (!req.user.twoFactorEnabled) {
    return res.message(req.baseUrl, new Error("Two-factor is already disabled"));
  }

  TwoFactor.disable(req.user.uid, function (err) {
    if (err) return next(err);

    if (req.session) {
      delete req.session.twoFactorCodes;
      delete req.session.showTwoFactorCodes;
      clearSetup(req);
    }

    res.message(req.baseUrl, "Disabled two-factor authentication");
  });
});

module.exports = router;
