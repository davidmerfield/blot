describe("macserver watcher performAction oversized upload handling", function () {
  let performAction;
  let clearOversizeIgnoreCache;
  let OVERSIZE_FILE_ERROR_CODE;

  beforeAll(async function () {
    const actionsModule = await import("./actions.js");
    ({ performAction, clearOversizeIgnoreCache } = actionsModule);

    const uploadModule = await import("../httpClient/upload.js");
    ({ OVERSIZE_FILE_ERROR_CODE } = uploadModule);
  });

  afterEach(function () {
    clearOversizeIgnoreCache();
  });

  it("does not retry oversize upload errors and does not request resync", async function () {
    let uploadCalls = 0;
    let resyncCalls = 0;

    await performAction("blog-1", "large.bin", "upload", {
      upload: async () => {
        uploadCalls += 1;
        const error = new Error("File size exceeds maximum");
        error.name = "OversizeFileError";
        error.code = OVERSIZE_FILE_ERROR_CODE;
        error.relativePath = "large.bin";
        error.size = 1024;
        error.maxFileSize = 100;
        throw error;
      },
      remove: async () => {},
      mkdir: async () => {},
      resync: async () => {
        resyncCalls += 1;
      },
    });

    expect(uploadCalls).toBe(1);
    expect(resyncCalls).toBe(0);
  });

  it("suppresses repeated fs events for oversized uploads during cooldown", async function () {
    let uploadCalls = 0;

    const dependencies = {
      upload: async () => {
        uploadCalls += 1;
        const error = new Error("File size exceeds maximum");
        error.name = "OversizeFileError";
        error.code = OVERSIZE_FILE_ERROR_CODE;
        throw error;
      },
      remove: async () => {},
      mkdir: async () => {},
      resync: async () => {},
    };

    await performAction("blog-2", "large-again.bin", "upload", dependencies);
    await performAction("blog-2", "large-again.bin", "upload", dependencies);

    expect(uploadCalls).toBe(1);
  });
});
