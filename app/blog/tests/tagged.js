describe("tags work on sites", function () {
  require("./util/setup")();

  it("lists entries in reverse chronological", async function () {
    await this.publish({ path: "/first.txt", content: "Tags: A\n\nFoo" });
    await this.publish({ path: "/second.txt", content: "Tags: A,B\n\nBar" });
    await this.publish({ path: "/third.txt", content: "Tags: B,C\n\nBaz" });

    await this.template({
      "tagged.html": "{{#entries}}{{title}} {{/entries}}",
    });

    const res = await this.get(`/tagged/a`);

    expect((await res.text()).trim().toLowerCase()).toEqual("second first");
  });
});
