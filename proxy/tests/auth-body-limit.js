const fs = require("fs");
const path = require("path");

describe("proxy authentication body limits", function () {
  it("matches authentication locations case-insensitively", function () {
    const file = path.join(__dirname, "../config/blot-site.conf");
    expect(fs.readFileSync(file, "utf8")).toMatch(
      /location ~\* \^\/sites\/\(log-in\|sign-up\|account\/password\)\(\/\|\$\)/
    );
  });
});
