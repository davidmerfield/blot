describe("folder", function () {
  global.test.site({ login: true });

  it("can update the site title", async function () {
    const titlePage = await this.text(`/sites/${this.blog.handle}/title`);

    expect(titlePage).toMatch(`${this.blog.title}`);

    await this.submit(`/sites/${this.blog.handle}/title`, {
      title: "New Title",
    });

    const titlePageAfter = await this.text(`/sites/${this.blog.handle}/title`);

    expect(titlePageAfter).toMatch("New Title");
  });
});
