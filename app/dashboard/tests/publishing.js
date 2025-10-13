describe("publishing settings", function () {
  const { promisify } = require("util");
  const Blog = require("models/blog");

  global.test.site({ login: true });

  it("saves image metadata preferences", async function () {
    const publishingPage = await this.text(`/sites/${this.blog.handle}/publishing`);
    expect(publishingPage).toMatch("Image metadata");

    await this.submit(`/sites/${this.blog.handle}`, {
      redirect: `/sites/${this.blog.handle}/publishing`,
      imageExif: "off",
    });

    const blogAfterOff = await promisify(Blog.get)({ id: this.blog.id });
    expect(blogAfterOff.imageExif).toBe("off");
    expect(blogAfterOff.isImageExifOff).toBeTrue();

    await this.submit(`/sites/${this.blog.handle}`, {
      redirect: `/sites/${this.blog.handle}/publishing`,
      imageExif: "full",
    });

    const blogAfterFull = await promisify(Blog.get)({ id: this.blog.id });
    expect(blogAfterFull.imageExif).toBe("full");
    expect(blogAfterFull.isImageExifFull).toBeTrue();
  });
});
