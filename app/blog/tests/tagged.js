  const client = require("models/client");
  const key = require("../key");
  const normalize = require("../normalize");

  fit("hydrates the sorted tag set when missing", function (done) {
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