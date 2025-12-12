const cheerio = require("cheerio");
const getEntry = require("../../models/entry/get");

describe("toc plugin", function () {

    require('./util/setup')();

    const getEntryByPath = (blogID, path) =>
        new Promise((resolve) => getEntry(blogID, path, (entry) => resolve(entry)));

    it("generates a nested toc with unique heading ids", async function () {

        const plugins = { ...this.blog.plugins, toc: { enabled: true, options: {} } };
        await this.blog.update({ plugins });

        const content = [
            "# Heading One",
            "## First Child",
            "### Deep Dive",
            "## First Child",
            "# Heading One",
            "### Skipped Level",
        ].join("\n");

        await this.write({ path: '/toc.md', content });

        const entry = await getEntryByPath(this.blog.id, '/toc.md');
        const $ = cheerio.load(entry.toc);

        const nav = $('#TOC');

        expect(nav.length).toEqual(1);

        const links = nav.find('a');
        const ids = links.map((_, el) => $(el).attr('id')).get();

        expect(ids).toContain('toc-heading-one');
        expect(ids).toContain('toc-heading-one-2');
        expect(ids).toContain('toc-first-child');
        expect(ids).toContain('toc-first-child-2');
        expect(ids).toContain('toc-deep-dive');

        const firstHeading = nav.find('> ul > li').first();
        expect(firstHeading.find('> ul > li').length).toBeGreaterThan(0);

        const skippedHeading = nav.find('a[href="#skipped-level"]');
        const parentHeading = skippedHeading.parents('li').eq(1).find('> a').attr('href');
        expect(parentHeading).toEqual('#heading-one-2');
    });

    it("skips toc generation when the plugin is disabled", async function () {

        const plugins = { ...this.blog.plugins, toc: { enabled: false, options: {} } };
        await this.blog.update({ plugins });

        await this.write({ path: '/no-toc.html', content: '<h1>Title</h1>' });

        const entry = await getEntryByPath(this.blog.id, '/no-toc.html');

        expect(entry.toc).toEqual("");
    });

    it("creates toc entries for html files and skips empty headings", async function () {

        const plugins = { ...this.blog.plugins, toc: { enabled: true, options: {} } };
        await this.blog.update({ plugins });

        const html = [
            '<h1 id="intro">Intro</h1>',
            '<h3>Skipped Level</h3>',
            '<h2>Details</h2>',
            '<h2> </h2>',
            '<h3>More Details</h3>',
        ].join('');

        await this.write({ path: '/html-file.html', content: html });

        const entry = await getEntryByPath(this.blog.id, '/html-file.html');
        const $ = cheerio.load(entry.toc);

        const nav = $('#TOC');
        expect(nav.length).toEqual(1);

        expect(nav.find('a[href="#intro"]').attr('id')).toEqual('toc-intro');
        expect(nav.find('a[href="#details"]').length).toEqual(1);
        expect(nav.find('a').length).toEqual(4);
        expect(nav.find('a').filter((_, el) => $(el).text().trim() === '').length).toEqual(0);

        const introList = nav.find('> ul > li').first();
        expect(introList.find('> ul > li a[href="#skipped-level"]').length).toEqual(1);
    });
});
