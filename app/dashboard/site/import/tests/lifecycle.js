const fs = require("fs-extra");
const os = require("os");
const path = require("path");
const lifecycle = require("../lifecycle");
const wordpress = require("../sources/wordpress");
const helper = require("../helper");
const assetDirectory = require("../helper/asset_directory");
const client = require("models/client");
const init = require("../init");

const xml = `<?xml version="1.0"?><rss><channel><title>Test</title><link>https://example.com</link>
<item><title>First post</title><link>https://example.com/post</link><pubDate>Tue, 04 Aug 2020 12:00:00 GMT</pubDate><wp:post_type>post</wp:post_type><wp:status>publish</wp:status><content:encoded><![CDATA[<p>Hello</p>]]></content:encoded></item>
<item><title>Second post</title><link>https://example.com/post</link><pubDate>Tue, 04 Aug 2020 12:00:00 GMT</pubDate><wp:post_type>post</wp:post_type><wp:status>publish</wp:status><content:encoded><![CDATA[<p>Later</p>]]></content:encoded></item>
</channel></rss>`;

describe("import job lifecycle", function () {
  let job;
  beforeEach(function () {
    spyOn(client, "publish").and.returnValue(Promise.resolve());
    job = init({ blogID: "test", label: "Test" });
  });
  afterEach(async function () { await fs.remove(job.importDirectory); });

  it("publishes Finished only after a readable archive exists", async function () {
    await job.run(() => fs.outputFile(path.join(job.outputDirectory, "post.txt"), "hello"));
    expect(fs.readFileSync(path.join(job.importDirectory, "result.zip")).slice(0, 2).toString()).toBe("PK");
    expect(fs.readFileSync(path.join(job.importDirectory, "status.txt"), "utf8")).toBe("Finished");
    expect(fs.existsSync(path.join(job.importDirectory, "result.zip.part"))).toBe(false);
  });

  it("removes partial output and asset staging directories on cancellation", async function () {
    let staging;
    await job.run(async () => {
      await fs.outputFile(path.join(job.outputDirectory, "partial.txt"), "partial");
      staging = await new Promise((resolve, reject) => assetDirectory({}, (err, dir) => err ? reject(err) : resolve(dir)));
      await fs.outputFile(path.join(staging, "asset"), "partial");
      await lifecycle.cancel(job.importDirectory);
    });
    expect(fs.existsSync(staging)).toBe(false);
    expect(fs.existsSync(job.outputDirectory)).toBe(false);
    expect(fs.existsSync(path.join(job.importDirectory, "result.zip"))).toBe(false);
    expect(fs.readFileSync(path.join(job.importDirectory, "status.txt"), "utf8")).toBe("Cancelled");
  });

  it("cancels an archive in progress and removes its partial zip", async function () {
    const create = fs.createWriteStream;
    spyOn(fs, "createWriteStream").and.callFake(function (...args) {
      const stream = create(...args);
      const write = stream.write;
      let cancelled = false;
      stream.write = function (...writeArgs) {
        if (!cancelled) {
          cancelled = true;
          fs.writeFileSync(path.join(job.importDirectory, "cancelled.txt"), "true");
          lifecycle.current().abort();
        }
        return write.apply(this, writeArgs);
      };
      return stream;
    });
    await job.run(() => fs.outputFile(path.join(job.outputDirectory, "post.txt"), "hello"));
    expect(fs.existsSync(path.join(job.importDirectory, "result.zip.part"))).toBe(false);
    expect(fs.existsSync(path.join(job.importDirectory, "result.zip"))).toBe(false);
    expect(fs.readFileSync(path.join(job.importDirectory, "status.txt"), "utf8")).toBe("Cancelled");
  });

  it("reports WordPress write errors with the post title and stops before the next post", async function () {
    const input = path.join(job.importDirectory, "input.xml");
    await fs.outputFile(input, xml);
    const writer = jasmine.createSpy("writer").and.callFake((post, cb) => cb(new Error("ENOSPC")));
    spyOn(helper.write, "createWriter").and.returnValue(writer);
    await job.run(() => new Promise((resolve, reject) => wordpress(input, job.outputDirectory, job.status, {}, err => err ? reject(err) : resolve())));
    expect(writer.calls.count()).toBe(1);
    expect(fs.readFileSync(path.join(job.importDirectory, "error.txt"), "utf8")).toContain("First post: ENOSPC");
    expect(fs.readFileSync(path.join(job.importDirectory, "status.txt"), "utf8")).toBe("Failed");
    expect(fs.existsSync(path.join(job.importDirectory, "result.zip"))).toBe(false);
  });

  it("stops between WordPress entries without finalizing", async function () {
    const input = path.join(job.importDirectory, "input.xml");
    await fs.outputFile(input, xml);
    const writer = jasmine.createSpy("writer").and.callFake((post, cb) => {
      lifecycle.cancel(job.importDirectory).then(() => cb(), cb);
    });
    spyOn(helper.write, "createWriter").and.returnValue(writer);
    await job.run(() => new Promise((resolve, reject) => wordpress(input, job.outputDirectory, job.status, {}, err => err ? reject(err) : resolve())));
    expect(writer.calls.count()).toBe(1);
    expect(fs.readFileSync(path.join(job.importDirectory, "status.txt"), "utf8")).toBe("Cancelled");
    expect(fs.existsSync(path.join(job.importDirectory, "result.zip"))).toBe(false);
  });
});
