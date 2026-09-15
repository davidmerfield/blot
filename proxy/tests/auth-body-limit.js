const fs = require("fs");
const path = require("path");

describe("proxy authentication body limits", function () {
  const contents = fs.readFileSync(
    path.join(__dirname, "../config/blot-site.conf"),
    "utf8"
  );

  it("matches authentication locations case-insensitively", function () {
    expect(contents).toMatch(/location ~\* \^\/sites\/sign-up\(\/\|\$\)/);
    expect(contents).toMatch(
      /location ~\* \^\/sites\/\(log-in\|account\/password\)\(\/\|\$\)/
    );
  });

  it("keeps a long read timeout on signup after capping the body", function () {
    const signup = contents.match(
      /location ~\* \^\/sites\/sign-up\(\/\|\$\) \{[\s\S]*?\n\}/
    )[0];
    const login = contents.match(
      /location ~\* \^\/sites\/\(log-in\|account\/password\)\(\/\|\$\) \{[\s\S]*?\n\}/
    )[0];

    expect(signup).toMatch(/client_max_body_size 4k;/);
    expect(signup).toMatch(/proxy_read_timeout 3m;/);
    expect(login).toMatch(/client_max_body_size 4k;/);
    expect(login).not.toMatch(/proxy_read_timeout 3m;/);
  });
});
