describe("tags.get", function () {
    
    const set = require("../set");
    const get = require("../get");
    const client = require("models/client");
    const key = require("../key");
    const normalize = require("../normalize");

    function saveEntries(blogID, entries, callback) {
        let index = 0;

        function next(err) {
            if (err) return callback(err);
            if (index >= entries.length) return callback();

            const entry = entries[index++];
            set(blogID, entry, next);
        }

        next();
    }

    // Create a test user and blog before each spec
    global.test.blog();

    it("can be invoked without error", function (done) {
        const blogID = this.blog.id;
        const entry = {
            id: "entry1",
            blogID,
            path: "/entry1",
            tags: ["tag1"],
        };

        set(blogID, entry, function (err) {
            if (err) return done.fail(err);

            get(blogID, "tag1", function (err, entryIDs, tag) {
                expect(err).toBeNull();
                expect(entryIDs).toEqual([entry.id]);
                expect(tag).toEqual("tag1");

                done();
            });
        });
    });

    it("returns entries sorted by dateStamp when limited", function (done) {
        const blogID = this.blog.id;
        const entries = [
            {
                id: "entry-a",
                blogID,
                path: "/entry-a",
                tags: ["Tag One"],
                dateStamp: 1000,
            },
            {
                id: "entry-b",
                blogID,
                path: "/entry-b",
                tags: ["Tag One"],
                dateStamp: 3000,
            },
            {
                id: "entry-c",
                blogID,
                path: "/entry-c",
                tags: ["Tag One"],
                dateStamp: 2000,
            },
        ];

        saveEntries(blogID, entries, function (err) {
            if (err) return done.fail(err);

            get(blogID, "Tag One", { limit: 2 }, function (err, entryIDs, tag) {
                if (err) return done.fail(err);

                expect(entryIDs).toEqual(["entry-b", "entry-c"]);
                expect(tag).toEqual("Tag One");

                done();
            });
        });
    });

    it("supports offsets for pagination", function (done) {
        const blogID = this.blog.id;
        const entries = [
            {
                id: "entry-d",
                blogID,
                path: "/entry-d",
                tags: ["Tag Two"],
                dateStamp: 1000,
            },
            {
                id: "entry-e",
                blogID,
                path: "/entry-e",
                tags: ["Tag Two"],
                dateStamp: 4000,
            },
            {
                id: "entry-f",
                blogID,
                path: "/entry-f",
                tags: ["Tag Two"],
                dateStamp: 3000,
            },
        ];

        saveEntries(blogID, entries, function (err) {
            if (err) return done.fail(err);

            get(
                blogID,
                "Tag Two",
                { offset: 1, limit: 1 },
                function (err, entryIDs, tag) {
                    if (err) return done.fail(err);

                    expect(entryIDs).toEqual(["entry-f"]);
                    expect(tag).toEqual("Tag Two");

                    done();
                }
            );
        });
    });

    it("hydrates the sorted set when missing", function (done) {
        const blogID = this.blog.id;
        const tagName = "Tag Three";
        const normalized = normalize(tagName);
        const entries = [
            {
                id: "entry-g",
                blogID,
                path: "/entry-g",
                tags: [tagName],
                dateStamp: 1000,
            },
            {
                id: "entry-h",
                blogID,
                path: "/entry-h",
                tags: [tagName],
                dateStamp: 4000,
            },
            {
                id: "entry-i",
                blogID,
                path: "/entry-i",
                tags: [tagName],
                dateStamp: 3000,
            },
        ];

        saveEntries(blogID, entries, function (err) {
            if (err) return done.fail(err);

            const sortedKey = key.sortedTag(blogID, normalized);

            client.del(sortedKey, function (err) {
                if (err) return done.fail(err);

                get(
                    blogID,
                    tagName,
                    { offset: 1, limit: 2 },
                    function (err, entryIDs, tag) {
                        if (err) return done.fail(err);

                        expect(entryIDs).toEqual(["entry-i", "entry-g"]);
                        expect(tag).toEqual(tagName);

                        client.exists(sortedKey, function (err, exists) {
                            if (err) return done.fail(err);

                            expect(exists).toBe(1);
                            done();
                        });
                    }
                );
            });
        });
    });

    it("hydrates missing legacy members when the sorted set exists", function (done) {
        const blogID = this.blog.id;
        const tagName = "Tag Four";
        const normalized = normalize(tagName);
        const legacyEntries = [
            {
                id: "entry-j",
                blogID,
                path: "/entry-j",
                tags: [tagName],
                dateStamp: 1000,
            },
            {
                id: "entry-k",
                blogID,
                path: "/entry-k",
                tags: [tagName],
                dateStamp: 2000,
            },
        ];

        saveEntries(blogID, legacyEntries, function (err) {
            if (err) return done.fail(err);

            const sortedKey = key.sortedTag(blogID, normalized);

            client.del(sortedKey, function (err) {
                if (err) return done.fail(err);

                const newEntry = {
                    id: "entry-l",
                    blogID,
                    path: "/entry-l",
                    tags: [tagName],
                    dateStamp: 3000,
                };

                set(blogID, newEntry, function (err) {
                    if (err) return done.fail(err);

                    get(blogID, tagName, { limit: 10 }, function (err, entryIDs, tag) {
                        if (err) return done.fail(err);

                        expect(entryIDs).toEqual(["entry-l", "entry-k", "entry-j"]);
                        expect(tag).toEqual(tagName);

                        done();
                    });
                });
            });
        });
    });
});
