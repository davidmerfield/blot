const fs = require("fs");
const vm = require("vm");
describe("Drive same-size reconciliation", function () {
  it("consults the checksum downloader even when size and timestamp match", async function () {
    let downloads = 0;
    const modifiedTime = "2026-01-01T00:00:00Z";
    const stubs = {
      "fs-extra": {}, "helper/localPath": (_, p) => p,
      "../database": {
        blog: { get: async () => ({ folderId: "folder", folderName: "folder", serviceAccountId: "service" }) },
        folder: () => ({ getByPath: async () => null, set: async () => {}, remove: async () => {} }),
      },
      "../util/download": async () => { downloads++; return { updated: true }; },
      "../serviceAccount/createDriveClient": async () => ({ files: { get: async () => ({ data: { name: "folder" } }) } }),
      "../util/checkWeCanContinue": () => async () => {},
      "clients/util/shouldIgnoreFile": () => false,
      "clients/util/resyncProgress": { countLocalFiles: async () => 1, createProgress: () => ({publish() {}, complete() {}, discover() {}, add() {}, finish() {}}) },
      "./util/driveReaddir": async () => [{id: "file", name: "file.txt", size: "4", modifiedTime, mimeType: "text/plain", md5Checksum: "changed"}],
      "./util/localReaddir": async () => [{name: "file.txt", size: 4, modifiedTime}],
      "./util/truncateToSecond": x => x,
      "./util/transformDriveItems": require("../sync/util/transformDriveItems"),
    };
    const module = { exports: {} };
    vm.runInNewContext(fs.readFileSync(require.resolve("../sync/sync"), "utf8"), {
      module, exports: module.exports, console: {log() {}},
      require: name => name in stubs ? stubs[name] : require(name),
    });
    await module.exports("blog");
    expect(downloads).toBe(1);
  });
});
