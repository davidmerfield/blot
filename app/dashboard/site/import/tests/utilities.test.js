const fs = require("fs-extra");
const path = require("path");
const archiver = require("archiver");
const {
  createDirectories,
  fixture,
  inspectFiles,
  inspectZip,
} = require("./utilities");

describe("import test utilities", function () {
  let directories;
  beforeEach(async () => (directories = await createDirectories()));
  afterEach(async () => directories.cleanup());

  it("creates isolated input, output, and import directories", async function () {
    expect(await Promise.all([directories.input, directories.output, directories.import].map(fs.pathExists))).toEqual([true, true, true]);
  });

  it("loads fixtures and normalizes generated files and ZIP entries", async function () {
    expect(await fixture("arena-channel.json")).toContain("Example channel");
    await fs.outputFile(path.join(directories.output, "nested", "post.txt"), "hello\r\n");
    expect(await inspectFiles(directories.output)).toEqual({ "nested/post.txt": "hello\n" });

    const zipPath = path.join(directories.import, "result.zip");
    await new Promise((resolve, reject) => {
      const output = fs.createWriteStream(zipPath);
      const zip = archiver("zip");
      output.on("close", resolve);
      output.on("error", reject);
      zip.on("error", reject);
      zip.pipe(output);
      zip.directory(directories.output, "Example");
      zip.finalize();
    });
    expect(await inspectZip(zipPath)).toEqual({ "Example/nested/post.txt": "hello\n" });
  });
});
