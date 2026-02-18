describe("entry.backlinks", function () {
  require("./setup")();

  it("works", async function () {
    const path = "/post.txt";
    const contents = "Link: linker\n\n[linker](/linked)";

    const pathLinked = "/linked.txt";
    const contentsLinked = "Link: linked\n\nHey";

    await this.set(pathLinked, contentsLinked);
    await this.set(path, contents);

    const entry = await this.get(pathLinked);

    expect(entry.backlinks).toEqual(["/linker"]);
  });

  it("will not contain deleted internal links", async function () {
    const path = "/post.txt";
    const contents = "Link: linker\n\n[linker](/linked)";

    const pathLinked = "/linked.txt";
    const contentsLinked = "Link: linked\n\nHey";

    await this.set(pathLinked, contentsLinked);
    await this.set(path, contents);

    const entry = await this.get(pathLinked);

    const updatedContents = "Link: linker\n\nlinker";
    await this.set(path, updatedContents);

    const entryAfterUpdate = await this.get(pathLinked);

    expect(entry.backlinks).toEqual(["/linker"]);
    expect(entryAfterUpdate.backlinks).toEqual([]);
  });

  it("works with multiple files", async function () {
    const pathFirst = "/post-1.txt";
    const contentsFirst = "Link: linker-1\n\n[linker](/linked)";

    const pathSecond = "/post-2.txt";
    const contentsSecond = "Link: linker-2\n\n[linker](/linked)";

    const pathLinked = "/linked.txt";
    const contentsLinked = "Link: linked\n\nHey";

    await this.set(pathLinked, contentsLinked);
    await this.set(pathFirst, contentsFirst);
    await this.set(pathSecond, contentsSecond);

    const entry = await this.get(pathLinked);

    expect(entry.backlinks.sort()).toEqual(["/linker-1", "/linker-2"]);
  });

  it("won't contain internal links from deleted posts", async function () {
    const path = "/post.txt";
    const contents = "Link: linker\n\n[linker](/linked)";

    const pathLinked = "/linked.txt";
    const contentsLinked = "Link: linked\n\nHey";

    await this.set(pathLinked, contentsLinked);
    await this.set(path, contents);

    const entry = await this.get(pathLinked);

    await this.drop(path);

    const entryAfterDrop = await this.get(pathLinked);

    expect(entry.backlinks).toEqual(["/linker"]);
    expect(entryAfterDrop.backlinks).toEqual([]);
  });

  it("updates the backlink when the linker's URL changes", async function () {
    const path = "/post.txt";
    const contents = "Link: linker\n\n[linker](/linked)";

    const pathLinked = "/linked.txt";
    const contentsLinked = "Link: linked\n\nHey";

    await this.set(pathLinked, contentsLinked);
    await this.set(path, contents);

    const entry = await this.get(pathLinked);

    const updatedContents = "Link: new-linker\n\n[linker](/linked)";
    await this.set(path, updatedContents);

    const entryAfterUpdate = await this.get(pathLinked);

    expect(entry.backlinks).toEqual(["/linker"]);
    expect(entryAfterUpdate.backlinks).toEqual(["/new-linker"]);
  });

  it("updates the backlinks property of deleted posts", async function () {
    const path = "/post.txt";
    const contents = "Link: linker\n\n[linker](/linked)";

    const pathLinked = "/linked.txt";
    const contentsLinked = "Link: linked\n\nHey";

    await this.set(pathLinked, contentsLinked);
    await this.set(path, contents);

    const entry = await this.get(pathLinked);

    await this.drop(pathLinked);
    await this.drop(path);

    const entryAfterDrop = await this.get(pathLinked);

    await this.set(pathLinked, contentsLinked);

    const entryAfterRestore = await this.get(pathLinked);


    expect(entry.backlinks).toEqual(["/linker"]);
    expect(entryAfterDrop.deleted).toEqual(true);
    expect(entryAfterRestore.backlinks).toEqual([]);
  });  
});
