const fs = require("fs-extra");
const os = require("os");
const { join } = require("path");
const { countLocalFiles, createProgress } = require("../resyncProgress");

describe("resync progress", function () {
  let directory;

  beforeEach(async function () {
    directory = await fs.mkdtemp(join(os.tmpdir(), "blot-resync-progress-"));
  });

  afterEach(async function () {
    await fs.remove(directory);
  });

  it("counts files recursively without counting directories", async function () {
    await fs.outputFile(join(directory, "one.txt"), "one");
    await fs.outputFile(join(directory, "nested", "two.txt"), "two");

    expect(await countLocalFiles(directory)).toBe(2);
  });

  it("increases the total before publishing newly discovered work", function () {
    const messages = [];
    const progress = createProgress(1, (message) => messages.push(message));

    progress.publish("Checking", "/one.txt");
    progress.publish("Downloading", "/two.txt", true);
    progress.finish("Finished processing folder");

    expect(messages).toEqual([
      "(1/1) Checking /one.txt",
      "(2/2) Downloading /two.txt",
      "(2/2) Finished processing folder",
    ]);
  });
});
