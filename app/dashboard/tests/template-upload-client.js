describe("template upload client", function () {
  const collect = require("../../views/js/collect-dropped-files.js");

  // Stands in for a browser File
  const file = (name, options = {}) => ({
    name,
    size: options.size || 10,
    type: options.type || "",
    webkitRelativePath: options.webkitRelativePath || "",
  });

  // Stands in for a FileSystemFileEntry / FileSystemDirectoryEntry
  const fileEntry = (name) => ({
    isFile: true,
    isDirectory: false,
    name,
    file: (resolve) => resolve(file(name)),
  });

  // readEntries is specified to return a partial batch, so the reader must be
  // called until it returns an empty one
  const directoryEntry = (name, children, batchSize = 2) => ({
    isFile: false,
    isDirectory: true,
    name,
    createReader: () => {
      let offset = 0;
      return {
        readEntries: (resolve) => {
          const batch = children.slice(offset, offset + batchSize);
          offset += batch.length;
          resolve(batch);
        },
      };
    },
  });

  const dataTransfer = ({ items = [], files = [], types = [] } = {}) => ({
    items,
    files,
    types,
  });

  const fileItem = (entry) => ({
    kind: "file",
    webkitGetAsEntry: () => entry,
  });

  describe("readAllDirectoryEntries", function () {
    it("reads every batch, not just the first", async function () {
      const children = [1, 2, 3, 4, 5].map((n) => fileEntry(`file-${n}.html`));
      const reader = directoryEntry("theme", children, 2).createReader();

      const entries = await collect.readAllDirectoryEntries(reader);

      expect(entries.length).toEqual(5);
    });

    it("handles an empty directory", async function () {
      const reader = directoryEntry("theme", []).createReader();

      expect((await collect.readAllDirectoryEntries(reader)).length).toEqual(0);
    });
  });

  describe("collectDroppedFiles", function () {
    it("keeps the path of each file inside the dropped folder", async function () {
      const entry = directoryEntry("my-theme", [
        fileEntry("index.html"),
        fileEntry("style.css"),
      ]);

      const collected = await collect.collectDroppedFiles(
        dataTransfer({ items: [fileItem(entry)] })
      );

      expect(collected.map((c) => c.relativePath).sort()).toEqual([
        "my-theme/index.html",
        "my-theme/style.css",
      ]);
    });

    it("recurses into nested folders", async function () {
      const entry = directoryEntry("my-theme", [
        fileEntry("index.html"),
        directoryEntry("partials", [fileEntry("head.html")]),
      ]);

      const collected = await collect.collectDroppedFiles(
        dataTransfer({ items: [fileItem(entry)] })
      );

      expect(collected.map((c) => c.relativePath).sort()).toEqual([
        "my-theme/index.html",
        "my-theme/partials/head.html",
      ]);
    });

    it("falls back to webkitRelativePath without the entries API", async function () {
      const collected = await collect.collectDroppedFiles(
        dataTransfer({
          // An item which cannot produce an entry
          items: [{ kind: "file", webkitGetAsEntry: () => null }],
          files: [
            file("index.html", { webkitRelativePath: "my-theme/index.html" }),
          ],
        })
      );

      expect(collected.map((c) => c.relativePath)).toEqual([
        "my-theme/index.html",
      ]);
    });

    it("falls back to file names when there are no items", async function () {
      const collected = await collect.collectDroppedFiles(
        dataTransfer({ files: [file("index.html")] })
      );

      expect(collected.map((c) => c.relativePath)).toEqual(["index.html"]);
    });

    it("ignores items which are not files", async function () {
      const collected = await collect.collectDroppedFiles(
        dataTransfer({
          items: [
            fileItem(fileEntry("index.html")),
            { kind: "string", webkitGetAsEntry: () => null },
          ],
        })
      );

      expect(collected.map((c) => c.relativePath)).toEqual(["index.html"]);
    });
  });

  describe("hasFileDragPayload", function () {
    it("is true for a file item", function () {
      expect(
        collect.hasFileDragPayload(dataTransfer({ items: [{ kind: "file" }] }))
      ).toBe(true);
    });

    it("is true when types contains Files", function () {
      expect(
        collect.hasFileDragPayload(dataTransfer({ types: ["Files"] }))
      ).toBe(true);
    });

    it("is false for dragged text", function () {
      expect(
        collect.hasFileDragPayload(
          dataTransfer({ items: [{ kind: "string" }], types: ["text/plain"] })
        )
      ).toBe(false);
    });

    it("is false without a dataTransfer", function () {
      expect(collect.hasFileDragPayload(null)).toBe(false);
    });
  });

  describe("collectSelectedFiles", function () {
    it("uses webkitRelativePath from a directory input", function () {
      const input = {
        files: [
          file("index.html", { webkitRelativePath: "my-theme/index.html" }),
          file("style.css", { webkitRelativePath: "my-theme/style.css" }),
        ],
      };

      expect(collect.collectSelectedFiles(input).map((c) => c.relativePath)).toEqual([
        "my-theme/index.html",
        "my-theme/style.css",
      ]);
    });

    it("falls back to the file name", function () {
      expect(
        collect.collectSelectedFiles({ files: [file("theme.zip")] })[0]
          .relativePath
      ).toEqual("theme.zip");
    });
  });

  describe("upload panel", function () {
    // The module reads `document` when required, so give it one first
    let panel;

    function element(attributes = {}) {
      const listeners = {};

      return {
        attributes,
        listeners,
        hidden: false,
        disabled: false,
        value: "",
        textContent: "",
        innerHTML: "",
        children: [],
        classList: {
          classes: [],
          add(name) {
            if (this.classes.indexOf(name) === -1) this.classes.push(name);
          },
          remove(name) {
            this.classes = this.classes.filter((c) => c !== name);
          },
          toggle(name, on) {
            if (on) this.add(name);
            else this.remove(name);
          },
          contains(name) {
            return this.classes.indexOf(name) > -1;
          },
        },
        getAttribute(name) {
          return attributes[name];
        },
        addEventListener(name, handler) {
          (listeners[name] = listeners[name] || []).push(handler);
        },
        dispatch(name, event) {
          (listeners[name] || []).forEach((handler) => handler(event));
        },
        appendChild(child) {
          this.children.push(child);
        },
      };
    }

    function build() {
      const dropzone = element();
      const problems = element();
      const status = element();
      const name = element();

      const root = element({
        "data-csrf": "token",
        "data-action": "/sites/example/template/new/upload",
      });

      const bySelector = {
        "[data-template-upload-dropzone]": dropzone,
        "[data-template-upload-problems]": problems,
        "[data-template-upload-status]": status,
        "[data-template-upload-name]": name,
        "[data-template-upload-folder-input]": null,
        "[data-template-upload-zip-input]": null,
      };

      root.querySelector = (selector) => bySelector[selector];

      return { root, dropzone, problems, status, name };
    }

    beforeEach(function () {
      global.window = { addEventListener: function () {} };
      global.document = {
        createElement: () => element(),
        createTextNode: (text) => ({ text }),
        querySelectorAll: () => [],
      };
      global.FormData = function () {
        this.appended = [];
        this.append = function (key, value) {
          this.appended.push(key);
        };
      };

      delete require.cache[
        require.resolve("../../views/js/new-template-files.js")
      ];
      panel = require("../../views/js/new-template-files.js");
    });

    afterEach(function () {
      delete global.window;
      delete global.document;
      delete global.FormData;
      delete global.fetch;
    });

    it("recognises a zip by extension and by type", function () {
      expect(panel.isZip({ name: "theme.zip", type: "" })).toBe(true);
      expect(panel.isZip({ name: "THEME.ZIP", type: "" })).toBe(true);
      expect(panel.isZip({ name: "theme", type: "application/zip" })).toBe(true);
      expect(panel.isZip({ name: "index.html", type: "text/html" })).toBe(false);
    });

    it("highlights only while a file drag is over the dropzone", function () {
      const { root, dropzone } = build();
      panel.init(root);

      const files = dataTransfer({ items: [{ kind: "file" }] });
      const preventDefault = function () {};

      dropzone.dispatch("dragenter", { dataTransfer: files, preventDefault });
      expect(dropzone.classList.contains("is-dragover")).toBe(true);

      // Entering a child element fires dragenter again before dragleave
      dropzone.dispatch("dragenter", { dataTransfer: files, preventDefault });
      dropzone.dispatch("dragleave", { dataTransfer: files, preventDefault });
      expect(dropzone.classList.contains("is-dragover")).toBe(true);

      dropzone.dispatch("dragleave", { dataTransfer: files, preventDefault });
      expect(dropzone.classList.contains("is-dragover")).toBe(false);
    });

    it("ignores a drag which carries no files", function () {
      const { root, dropzone } = build();
      panel.init(root);

      dropzone.dispatch("dragenter", {
        dataTransfer: dataTransfer({ items: [{ kind: "string" }] }),
        preventDefault: function () {},
      });

      expect(dropzone.classList.contains("is-dragover")).toBe(false);
    });

    it("refuses too many files without making a request", function () {
      const { root, dropzone, status } = build();
      global.fetch = jasmine.createSpy("fetch");
      panel.init(root);

      const files = [];
      for (let i = 0; i < 101; i++) files.push(file(`view-${i}.html`));

      dropzone.dispatch("drop", {
        dataTransfer: dataTransfer({ files }),
        preventDefault: function () {},
      });

      // collectDroppedFiles resolves a promise, so let it settle
      return Promise.resolve().then(function () {
        expect(global.fetch).not.toHaveBeenCalled();
        expect(status.textContent).toContain("100 files");
      });
    });

    it("refuses files which are too large without making a request", function () {
      const { root, dropzone, status } = build();
      global.fetch = jasmine.createSpy("fetch");
      panel.init(root);

      dropzone.dispatch("drop", {
        dataTransfer: dataTransfer({
          files: [file("index.html", { size: 11 * 1024 * 1024 })],
        }),
        preventDefault: function () {},
      });

      return Promise.resolve().then(function () {
        expect(global.fetch).not.toHaveBeenCalled();
        expect(status.textContent).toContain("too large");
      });
    });
  });
});
