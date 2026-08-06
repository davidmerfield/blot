const crypto = require("crypto");
const fs = require("fs-extra");
const nock = require("nock");
const os = require("os");
const path = require("path");
const yauzl = require("yauzl");

const fixturesDirectory = path.join(__dirname, "fixtures");

async function createDirectories() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "blot-import-test-"));
  const directories = {
    root,
    input: path.join(root, "input"),
    output: path.join(root, "output"),
    import: path.join(root, "import"),
  };
  await Promise.all(
    [directories.input, directories.output, directories.import].map((dir) =>
      fs.ensureDir(dir)
    )
  );
  directories.cleanup = () => fs.remove(root);
  return directories;
}

function fixture(name, encoding = "utf8") {
  return fs.readFile(path.join(fixturesDirectory, name), encoding);
}

async function fixtureFile(name, inputDirectory) {
  const destination = path.join(inputDirectory, path.basename(name));
  await fs.copy(path.join(fixturesDirectory, name), destination);
  return destination;
}

function normalizedContent(buffer) {
  if (buffer.includes(0)) {
    return `<binary sha256=${crypto.createHash("sha256").update(buffer).digest("hex")}>`;
  }
  return buffer.toString("utf8").replace(/\r\n/g, "\n");
}

async function inspectFiles(directory) {
  const result = {};
  async function visit(current) {
    const names = (await fs.readdir(current)).sort();
    for (const name of names) {
      const absolute = path.join(current, name);
      const stat = await fs.stat(absolute);
      if (stat.isDirectory()) await visit(absolute);
      else {
        const relative = path.relative(directory, absolute).split(path.sep).join("/");
        result[relative] = normalizedContent(await fs.readFile(absolute));
      }
    }
  }
  await visit(directory);
  return result;
}

function inspectZip(filename) {
  return new Promise((resolve, reject) => {
    yauzl.open(filename, { lazyEntries: true }, (error, zip) => {
      if (error) return reject(error);
      const result = {};
      zip.on("error", reject);
      zip.on("end", () => resolve(result));
      zip.on("entry", (entry) => {
        if (/\/$/.test(entry.fileName)) return zip.readEntry();
        zip.openReadStream(entry, (streamError, stream) => {
          if (streamError) return reject(streamError);
          const chunks = [];
          stream.on("data", (chunk) => chunks.push(chunk));
          stream.on("error", reject);
          stream.on("end", () => {
            result[entry.fileName.replace(/\\/g, "/")] = normalizedContent(
              Buffer.concat(chunks)
            );
            zip.readEntry();
          });
        });
      });
      zip.readEntry();
    });
  });
}

function mockHTTP() {
  nock.disableNetConnect();
  return nock;
}

function restoreHTTP() {
  const pending = nock.pendingMocks();
  nock.cleanAll();
  nock.enableNetConnect();
  if (pending.length) throw new Error(`Unused HTTP mocks: ${pending.join(", ")}`);
}

module.exports = {
  createDirectories,
  fixture,
  fixtureFile,
  fixturesDirectory,
  inspectFiles,
  inspectZip,
  mockHTTP,
  nock,
  restoreHTTP,
};
