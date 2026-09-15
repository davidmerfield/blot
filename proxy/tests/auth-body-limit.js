const fs = require("fs");
const path = require("path");
const mustache = require("mustache");

describe("proxy authentication body limits", function () {
  const configDir = path.join(__dirname, "../config");
  const contents = fs.readFileSync(
    path.join(configDir, "blot-site.conf"),
    "utf8"
  );
  const huge = fs.readFileSync(
    path.join(configDir, "reverse-proxy-huge.conf"),
    "utf8"
  );
  const standard = fs.readFileSync(
    path.join(configDir, "reverse-proxy.conf"),
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

    expect(signup).toMatch(/reverse-proxy-huge\.conf/);
    expect(signup).toMatch(/client_max_body_size 4k;/);
    expect(signup.indexOf("reverse-proxy-huge.conf")).toBeLessThan(
      signup.indexOf("client_max_body_size 4k;")
    );
    expect(huge).toMatch(/proxy_read_timeout 3m;/);
    expect(huge).toMatch(/proxy_send_timeout 3m;/);
    expect(standard).not.toMatch(/proxy_read_timeout 3m;/);
    expect(login).toMatch(/reverse-proxy\.conf/);
    expect(login).toMatch(/client_max_body_size 4k;/);
    expect(login.indexOf("reverse-proxy.conf")).toBeLessThan(
      login.indexOf("client_max_body_size 4k;")
    );
    expect(login).not.toMatch(/reverse-proxy-huge\.conf/);
  });

  it("does not declare proxy timeouts twice after rendering signup", function () {
    const partials = {};
    fs.readdirSync(configDir).forEach(function (file) {
      if (file.endsWith(".conf")) {
        partials[file] = fs.readFileSync(path.join(configDir, file), "utf8");
      }
    });
    const rendered = mustache.render(contents, {}, partials);
    const signup = rendered.match(
      /location ~\* \^\/sites\/sign-up\(\/\|\$\) \{[\s\S]*?\n\}/
    )[0];
    const sendTimeouts = signup.match(/proxy_send_timeout [^;]+;/g);
    const readTimeouts = signup.match(/proxy_read_timeout [^;]+;/g);

    expect(sendTimeouts).toEqual(["proxy_send_timeout 3m;"]);
    expect(readTimeouts).toEqual(["proxy_read_timeout 3m;"]);
    expect(signup).toMatch(/client_max_body_size 4k;/);
  });
});
