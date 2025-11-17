describe("tags.set", function () {
    
    const set = require("../set");

    // Create a test user and blog before each spec
    global.test.blog();

    it("can be invoked without error", function (done) {
        const entry = {
            id: "entry1",
            blogID: "blog1",
            path: "/entry1",
            tags: ["tag1"],
        };

        set(this.blog.id, entry, function (err, entryIDs, tag) {
            expect(err).toBeUndefined();
            done();
        });
    });
});