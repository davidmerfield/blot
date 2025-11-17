describe("minifier", function () {
  require("./util/setup")();

  // text taken from https://github.com/clean-css/clean-css/issues/1180
  it("correctly minifies CSS with empty values", async function () {
    await this.template({
      "style.css": `.inset { --inset: inset; } .outset {--inset: ; } .shadow { box-shadow: var(--inset) 0 2px 2px #0004; }`,
    });

    const res = await this.get("/style.css");

    expect(res.status).toEqual(200);

    const text = await res.text();

    expect(text).toBe(".inset{--inset:inset}.outset{--inset: }.shadow{box-shadow:var(--inset) 0 2px 2px #0004}");
  });
});
