module.exports = function (req, res, next) {
  if (!req.account.setupComplete) {
    console.warn("Blog has not completed set up");
    return res.status(409).send("Blog has not completed set up");
  }

  next();
};
