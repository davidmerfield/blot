describe("augment", function () {

    require('../../tests/util/setup')();

    it("adds formatDate function to entries", async function () {
        
        await this.write({path: "/first.txt", content: "Foo"});
        await this.template({
            'entry.html': '{{#entry}}{{#formatDate}}YYYY{{/formatDate}}{{/entry}}'
        }, { locals: { name: 'David' } });

        const res = await this.get('/first');
        const body = await res.text();

        expect(res.status).toEqual(200);
        expect(body.trim()).toEqual(new Date().getFullYear().toString());
    });
    
    it("adds ratio property to thumbnails", async function () {
    
        const image = await require('sharp')({
            create: {
                width: 100,
                height: 200,
                channels: 4,
                background: { r: 255, g: 255, b: 255, alpha: 1 }
            }
        }).png().toBuffer();

        await this.write({path: "/_thumbnail.jpg", content: image});
        await this.write({path: "/first.txt", content: "![](_thumbnail.jpg)"});
        await this.template({'entry.html': '{{entry.thumbnail.large.ratio}}'});

        const res = await this.get('/first');
        const body = await res.text();

        expect(res.status).toEqual(200);
        // this is used to apply a padding-bottom to the thumbnail container to maintain aspect ratio
        expect(body.trim()).toEqual('200%');
    });

    it("renders entry backlinks", async function () {
        
        await this.write({path: "/first.txt", content: "Foo"});
        await this.write({path: "/second.txt", content: "Title: Second\n\n[[first]]"});
        await this.template({
            'entry.html': '{{#entry}}{{#backlinks}}{{title}}{{/backlinks}}{{/entry}}'
        });

        const res = await this.get('/first');
        const body = await res.text();

        expect(res.status).toEqual(200);
        expect(body.trim()).toEqual('Second');
    });


    it("creates lowercase metadata aliases for rendering", async function () {

        await this.write({
            path: "/mixed-case-metadata.txt",
            content: "Apple: Honeycrisp\n\nBody"
        });

        await this.template({
            'entry.html': '{{entry.metadata.apple}}'
        });

        const res = await this.get('/mixed-case-metadata');
        const body = await res.text();

        expect(res.status).toEqual(200);
        expect(body.trim()).toEqual('Honeycrisp');
    });

    it("preserves explicit lowercase metadata values", async function () {

        await this.write({
            path: "/metadata-precedence.txt",
            content: "Apple: Honeycrisp\napple: Gala\n\nBody"
        });

        await this.template({
            'entry.html': '{{entry.metadata.apple}}'
        });

        const res = await this.get('/metadata-precedence');
        const body = await res.text();

        expect(res.status).toEqual(200);
        expect(body.trim()).toEqual('Gala');
    });
    it("encodes tag slugs when augmenting entry tags", async function () {

        await this.write({
            path: "/slash-tag.txt",
            content: "Title: Slash Tag\nTags: Design/UI\n\nBody"
        });

        await this.template({
            'entry.html': '{{#entry.tags}}{{slug}}{{/entry.tags}}'
        });

        const res = await this.get('/slash-tag');
        const body = await res.text();

        expect(res.status).toEqual(200);
        expect(body.trim()).toEqual('design%2Fui');
    });

    it("does not resolve backlink URLs for list locals that do not render them", async function () {
        const Entry = require("models/entry");

        await this.write({ path: "/target.txt", content: "Title: Target\n\nTarget body" });
        await this.write({
            path: "/linker.txt",
            content: "Title: Linker\n\n[see](/target)",
        });

        await this.template(
            { "list.html": "{{#allEntries}}{{title}} {{/allEntries}}" },
            { views: { "list.html": { url: "/list" } } }
        );

        spyOn(Entry, "getByUrl").and.callThrough();

        const locals = await (await this.get("/list?json=1")).json();

        // routes/entry.js looks up the request path before falling through
        // to the view; the assertion is that augment did not fan out to
        // each row's backlink URLs.
        const backlinkFetches = Entry.getByUrl.calls
            .allArgs()
            .filter((args) => {
                const url = String(args[1]);
                return url.indexOf("linker") !== -1 || url.indexOf("target") !== -1;
            });
        expect(backlinkFetches).toEqual([]);
        expect(locals.allEntries.length).toEqual(2);

        const linker = locals.allEntries.find((entry) => entry.title === "Linker");
        const target = locals.allEntries.find((entry) => entry.title === "Target");
        expect(Array.isArray(target.backlinks)).toBe(true);
        expect(target.backlinks.every((link) => typeof link === "string")).toBe(true);
        expect(linker).toBeDefined();
    });

    it("hydrates backlinks when a list local renders them", async function () {
        await this.write({ path: "/target.txt", content: "Title: Target\n\nTarget body" });
        await this.write({
            path: "/linker.txt",
            content: "Title: Linker\n\n[see](/target)",
        });

        await this.template(
            {
                "list.html":
                    "{{#allEntries}}{{title}}:[{{#backlinks}}{{title}}{{/backlinks}}] {{/allEntries}}",
            },
            { views: { "list.html": { url: "/list" } } }
        );

        const body = (await (await this.get("/list")).text()).trim();
        expect(body).toContain("Target:[Linker]");
    });

    it("does not re-fetch the same backlink URL on a second entry render", async function () {
        const Entry = require("models/entry");

        await this.write({ path: "/target.txt", content: "Title: Target\n\nTarget body" });
        await this.write({
            path: "/linker.txt",
            content: "Title: Linker\n\n[see](/target)",
        });
        await this.template({
            "entry.html": "{{#entry}}{{#backlinks}}{{title}}{{/backlinks}}{{/entry}}",
        });

        spyOn(Entry, "getByUrl").and.callThrough();

        const first = await this.get("/target");
        expect((await first.text()).trim()).toEqual("Linker");

        const backlinkFetches = Entry.getByUrl.calls
            .allArgs()
            .filter((args) => String(args[1]).indexOf("linker") !== -1);
        expect(backlinkFetches.length).toBeGreaterThan(0);
        const firstCount = backlinkFetches.length;

        const second = await this.get("/target");
        expect((await second.text()).trim()).toEqual("Linker");

        const backlinkFetchesAfter = Entry.getByUrl.calls
            .allArgs()
            .filter((args) => String(args[1]).indexOf("linker") !== -1);
        expect(backlinkFetchesAfter.length).toEqual(firstCount);
    });
});

describe("augment backlink hydration", function () {
    const Entry = require("models/entry");
    const EntryInstance = require("models/entry/instance");
    const augmentPath = require.resolve("../load/augment");
    const cachePath = require.resolve("../load/getCachedEntryByUrl");

    function loadAugment() {
        delete require.cache[augmentPath];
        delete require.cache[cachePath];
        return require("../load/augment");
    }

    afterEach(function () {
        delete require.cache[augmentPath];
        delete require.cache[cachePath];
    });

    function makeEntry(overrides) {
        const entry = new EntryInstance();
        Object.assign(
            entry,
            {
                path: "/target.txt",
                url: "/target",
                tags: [],
                metadata: {},
                backlinks: ["/linker"],
                dateStamp: Date.now(),
                updated: Date.now(),
                created: Date.now(),
            },
            overrides
        );
        return entry;
    }

    function makeReq(retrieve) {
        return {
            blog: {
                id: "blog-1",
                cacheID: 100,
                timeZone: "UTC",
                locals: { blogURL: "https://example.com" },
            },
            retrieve: retrieve || {},
        };
    }

    function stubLinkedEntry() {
        spyOn(Entry, "getByUrl").and.callFake(function (blogID, url, callback) {
            callback({
                path: "/linker.txt",
                title: "Linker",
                url: url,
                scheduled: false,
            });
        });
    }

    it("hydrates backlinks on the page entry", async function () {
        const augment = loadAugment();
        stubLinkedEntry();

        const entry = makeEntry();
        const req = makeReq({ entry: true, backlinks: true });
        const res = { locals: { entry: entry } };

        await augment(req, res, entry);

        expect(Entry.getByUrl).toHaveBeenCalledTimes(1);
        expect(entry.backlinks[0].title).toEqual("Linker");
    });

    it("hydrates backlinks on next and previous from the same cache", async function () {
        const augment = loadAugment();
        stubLinkedEntry();

        const entry = makeEntry({ path: "/current.txt", url: "/current" });
        entry.next = makeEntry({ path: "/next.txt", url: "/next" });
        entry.previous = makeEntry({ path: "/previous.txt", url: "/previous" });

        const req = makeReq({ entry: true, backlinks: true });
        const res = { locals: { entry: entry } };

        await Promise.all([
            augment(req, res, entry),
            augment(req, res, entry.next),
            augment(req, res, entry.previous),
        ]);

        expect(Entry.getByUrl).toHaveBeenCalledTimes(1);
        expect(entry.backlinks[0].title).toEqual("Linker");
        expect(entry.next.backlinks[0].title).toEqual("Linker");
        expect(entry.previous.backlinks[0].title).toEqual("Linker");
    });

    it("leaves list-local backlinks as URLs when the view does not render them", async function () {
        const augment = loadAugment();
        stubLinkedEntry();

        const entry = makeEntry();
        const req = makeReq({ allEntries: { fields: { title: true } } });
        const res = { locals: {} };

        await augment(req, res, entry);

        expect(Entry.getByUrl).not.toHaveBeenCalled();
        expect(entry.backlinks).toEqual(["/linker"]);
    });

    it("hydrates list-local backlinks when retrieve metadata asks for them", async function () {
        const augment = loadAugment();
        stubLinkedEntry();

        const entry = makeEntry();
        const req = makeReq({
            allEntries: { fields: { title: true, backlinks: true } },
        });
        const res = { locals: {} };

        await augment(req, res, entry);

        expect(Entry.getByUrl).toHaveBeenCalledTimes(1);
        expect(entry.backlinks[0].title).toEqual("Linker");
    });

    it("hydrates route-provided {{#entries}} lists that render backlinks", async function () {
        const augment = loadAugment();
        stubLinkedEntry();

        const entry = makeEntry();
        const req = makeReq({ entries: true, backlinks: true });
        const res = { locals: {} };

        await augment(req, res, entry);

        expect(Entry.getByUrl).toHaveBeenCalledTimes(1);
        expect(entry.backlinks[0].title).toEqual("Linker");
    });
});
