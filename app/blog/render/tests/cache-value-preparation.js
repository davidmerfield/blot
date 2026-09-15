const { LRUCache } = require("lru-cache");
const EntryInstance = require("models/entry/instance");
const { cloneDeep, prepareCacheValue } = require("../../lib/clone");

describe("cache value preparation", function () {
  it("freezes an isolated copy while retaining EntryInstance prototypes", function () {
    const entry = new EntryInstance();
    entry.title = "Original";
    const prepared = prepareCacheValue([entry], {
      preserveEntryInstances: true,
    });

    expect(prepared.payload[0] instanceof EntryInstance).toBe(true);
    expect(Object.isFrozen(prepared.payload[0])).toBe(true);
    const response = cloneDeep(prepared.payload, {
      preserveEntryInstances: true,
    });
    response[0].title = "Changed";
    expect(prepared.payload[0].title).toBe("Original");
  });

  it("uses the envelope estimate to reject a value over the byte cap", function () {
    const cache = new LRUCache({
      maxSize: 64,
      sizeCalculation: (envelope) => envelope.size,
    });
    cache.set("large", prepareCacheValue({ body: "x".repeat(100) }));
    expect(cache.has("large")).toBe(false);
  });

  it("uses structuredClone while restoring EntryInstance prototypes", function () {
    const entry = new EntryInstance();
    entry.title = "Hello";
    entry.nested = { count: 1 };
    const cloned = cloneDeep([entry], { preserveEntryInstances: true });
    expect(cloned[0] instanceof EntryInstance).toBe(true);
    cloned[0].title = "Changed";
    cloned[0].nested.count = 2;
    expect(entry.title).toBe("Hello");
    expect(entry.nested.count).toBe(1);
  });

  it("preserves Date instances through cloneDeep", function () {
    const date = new Date("2020-01-01T00:00:00Z");
    const cloned = cloneDeep({ updated: date });
    expect(cloned.updated instanceof Date).toBe(true);
    expect(cloned.updated.getTime()).toEqual(date.getTime());
    cloned.updated.setTime(0);
    expect(date.getTime()).not.toEqual(0);
  });

  it("falls back when the value cannot be structured-cloned", function () {
    const value = {
      title: "Hello",
      formatDate: function () {
        return "date";
      },
    };
    const cloned = cloneDeep(value);
    expect(cloned.title).toBe("Hello");
    expect(cloned.formatDate).toBe(value.formatDate);
    cloned.title = "Changed";
    expect(value.title).toBe("Hello");
  });
});
