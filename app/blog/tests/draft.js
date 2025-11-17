describe("drafts", function () {

    require('./util/setup')();

    it("updates a draft dynamically", async function () {

        await this.write({path: '/Drafts/index.txt', content: 'Hello, world!'});
        await this.template({ 'entry.html': '{{#entry}} {{{html}}} {{/entry}}', 'error.html': 'Err' });

        const res = await this.get('/draft/view/Drafts/index.txt');
        const body = await res.text();

        expect(res.status).toEqual(200);
        expect(body.trim()).toContain('Hello, world!');

        // update the draft
        await this.write({path: '/Drafts/index.txt', content: 'Hello, world! Updated!'});

        const res2 = await this.get('/draft/view/Drafts/index.txt');
        const body2 = await res2.text();

        expect(res2.status).toEqual(200);
        expect(body2.trim()).toContain('Hello, world! Updated!');
    });

    it("handles a broken draft url", async function () {
        const res = await this.get('/draft/view/Drafts/does-not-exist.txt');
        expect(res.status).toEqual(404);
    });

    it("streams a draft", async function () {
        // Prepare the initial draft and templates
        await this.write({ path: '/Drafts/index.txt', content: 'Hello, world!' });
        await this.template({ 
            'entry.html': '{{#entry}} {{{html}}} {{/entry}}', 
            'error.html': 'Err' 
        });
        
        await this.stream({
            path: '/draft/stream/Drafts/index.txt',
            onStreamReady: () => this.write({ path: '/Drafts/index.txt', content: 'Updated!' }),
            expectedText: 'Updated!'
        });        
    });

});