const { runChecks } = require("../index");
const checks = require("../checks");

async function rejection(promise) {
  try {
    await promise;
  } catch (err) {
    return err;
  }
  return null;
}

describe("deploy verify-container", function () {
  it("passes when every check passes", async function () {
    const result = await runChecks(
      [
        { name: "a", run: async () => "fine" },
        { name: "b", run: () => "also fine" },
      ],
      {}
    );

    expect(result.ok).toBe(true);
    expect(result.report).toContain("PASS  a: fine");
    expect(result.report).toContain("PASS  b: also fine");
  });

  it("fails, but still runs the remaining checks, when one throws", async function () {
    let ran = false;
    const result = await runChecks(
      [
        {
          name: "broken",
          run: async () => {
            throw new Error("boom");
          },
        },
        {
          name: "after",
          run: async () => {
            ran = true;
            return "ok";
          },
        },
      ],
      {}
    );

    expect(result.ok).toBe(false);
    expect(result.report).toContain("FAIL  broken: boom");
    expect(result.report).toContain("PASS  after: ok");
    expect(ran).toBe(true);
  });

  it("fails a check that hangs", async function () {
    const result = await runChecks(
      [{ name: "hangs", run: () => new Promise(() => {}) }],
      {},
      20
    );

    expect(result.ok).toBe(false);
    expect(result.report).toContain("FAIL  hangs: timed out");
  });

  it("gives every real check a name and a run function", function () {
    for (const check of checks) {
      expect(typeof check.name).toBe("string");
      expect(typeof check.run).toBe("function");
    }
  });

  it("fails the release ID check on a mismatch", async function () {
    const releaseCheck = checks.find((c) => c.name === "release ID");
    const original = process.env.BLOT_RELEASE_ID;
    process.env.BLOT_RELEASE_ID = "abc";

    try {
      expect(await rejection(releaseCheck.run({ expectedRelease: "def" }))).not.toBe(null);
      expect(await rejection(releaseCheck.run({ expectedRelease: "abc" }))).toBe(null);
    } finally {
      if (original === undefined) delete process.env.BLOT_RELEASE_ID;
      else process.env.BLOT_RELEASE_ID = original;
    }
  });

  it("fails the blog folder check when the data mount is empty", async function () {
    const dataCheck = checks.find((c) => c.name === "blog folders match redis");
    const fs = require("fs");
    const os = require("os");
    const path = require("path");
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "verify-"));
    const redis = { sMembers: async () => ["BLOG_1", "BLOG_2"] };

    try {
      const run = () =>
        rejection(dataCheck.run({ config: { blog_folder_dir: dir }, redis }));

      expect((await run()).message).toMatch(/no blog folders/);

      fs.mkdirSync(path.join(dir, "BLOG_1"));
      expect((await run()).message).toMatch(/wrong or stale data mount/);

      fs.mkdirSync(path.join(dir, "BLOG_2"));
      expect(await run()).toBe(null);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
