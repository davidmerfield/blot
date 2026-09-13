const ensure = require("helper/ensure");
const augment = require("./augment");
const eachEntry = require("./eachEntry");

module.exports = async function loadView(req, res) {
  ensure(req, "object").and(res, "object");

  await eachEntry(res.locals, async (entry, owningLocal) => {
    await augment(req, res, entry, owningLocal);
  });

  return { req, res };
};
