describe("redirects revision", function () {
  const { promisify } = require("util");
  const client = require("models/client");
  const set = promisify(require("../set"));
  const drop = promisify(require("../drop"));
  const key = require("../key");

  global.test.blog();

  it("bumps a redis revision when mappings change", async function () {
    const revKey = key.redirectsRev(this.blog.id);

    await set(this.blog.id, [{ from: "/old", to: "/new" }]);
    const afterSet = await client.get(revKey);
    expect(afterSet).toBeTruthy();

    await new Promise((resolve) => setTimeout(resolve, 2));

    await drop(this.blog.id, "/old");
    const afterDrop = await client.get(revKey);
    expect(afterDrop).toBeTruthy();
    expect(afterDrop).not.toEqual(afterSet);
  });
});
