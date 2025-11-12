describe("cdn integration", function () {
  require("./util/setup")();

  const replaceFolderLinks = require("../render/replaceFolderLinks/html");
  const lookupFile = require("../render/replaceFolderLinks/lookupFile");

  it("serves folder assets via the CDN", async function () {
    const filePath = "/folder/cdn-test.txt";
    const fileContents = "CDN integration test content";

    await this.write({ path: filePath, content: fileContents });
    await this.blog.rebuild();

    const rewritten = await replaceFolderLinks(
      this.blog,
      `<img src="${filePath}">`
    );

    const match = rewritten.match(/src=\"([^\"]+)\"/);
    expect(match).not.toBeNull();

    const cdnURL = match && match[1];
    const lookupURL = await lookupFile(
      this.blog.id,
      this.blog.cacheID,
      filePath
    );

    expect(cdnURL).toEqual(lookupURL);

    const response = await this.fetch(cdnURL);
    expect(response.status).toEqual(200);
    expect(await response.text()).toEqual(fileContents);

    expect(await this.text(cdnURL)).toEqual(fileContents);
  });
});
