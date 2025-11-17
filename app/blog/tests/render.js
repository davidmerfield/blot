describe("render", function () {

    require('./util/setup')();

    it("exposes template locals to individual views", async function () {
        
        await this.template({
            'entries.html': 'Hello, {{name}}!'
        }, { locals: { name: 'David' } });

        const res = await this.get('/');
        const body = await res.text();

        expect(res.status).toEqual(200);
        expect(body.trim()).toEqual('Hello, David!');
    });

    it("overrides view-specific locals with template locals", async function () {
        
        await this.template({
            'entries.html': 'Hello, {{name}}!'
        }, { 
            locals: { name: 'David' },
            views: { 'entries.html': {
                locals: { name: 'John' }
            } }
        });

        const res = await this.get('/');
        const body = await res.text();

        expect(res.status).toEqual(200);
        expect(body.trim()).toEqual('Hello, John!');
    });

    it("exposes partials to views, including partials in partials", async function () {
        
        await this.template({
            'entries.html': '{{> name}}{{> footer}}',
            'name.html': '{{> greeting}} David',
            'greeting.html': 'Hello',
        }, { views: { 'entries.html': { partials: { footer: ' FOOTER' } } } });

        const res = await this.get('/');
        const body = await res.text();

        expect(res.status).toEqual(200);
        expect(body.trim()).toEqual('Hello David FOOTER');
    });

});