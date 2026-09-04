describe("dashboard redirects", function () {
  const { promisify } = require("util");
  const Redirects = require("models/redirects");

  const setRedirects = promisify(Redirects.set);

  global.test.site({ login: true });

  it("warns when a saved redirect matches a built-in URL", async function () {
    await setRedirects(this.blog.id, [
      { from: "/search", to: "/" },
      { from: "/old-url", to: "/" },
    ]);

    const $ = await this.parse(
      `/sites/${this.blog.handle}/settings/redirects`
    );

    const conflictRow = $("#redirects section.has-conflict");
    expect(conflictRow.length).toEqual(1);
    expect(conflictRow.find("input.lab").val()).toEqual("/search");
    expect(conflictRow.find(".redirect-conflict").attr("hidden")).toBeUndefined();
    expect(conflictRow.find(".redirect-conflict").attr("title")).toMatch(
      /won't run/i
    );
    expect(conflictRow.find(".redirect-conflict-tooltip").text()).toMatch(
      /won't run/i
    );

    const okRow = $("#redirects section").filter(function () {
      return $(this).find("input.lab").val() === "/old-url";
    });
    expect(okRow.hasClass("has-conflict")).toBe(false);
    expect(okRow.find(".redirect-conflict").attr("hidden")).toBeDefined();
  });

  it("returns JSON for a single from path", async function () {
    const conflictRes = await this.fetch(
      `/sites/${this.blog.handle}/settings/redirects/conflict?from=/search`
    );
    expect(conflictRes.status).toEqual(200);

    const conflict = await conflictRes.json();
    expect(conflict.conflict.type).toEqual("route");
    expect(conflict.conflict.message).toMatch(/search/i);

    const freeRes = await this.fetch(
      `/sites/${this.blog.handle}/settings/redirects/conflict?from=/old-cms-url`
    );
    expect(freeRes.status).toEqual(200);

    const free = await freeRes.json();
    expect(free.conflict).toBe(null);
  });
});
