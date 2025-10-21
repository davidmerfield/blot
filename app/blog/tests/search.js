describe("search", function () {

    require('./util/setup')();

    it("lets you search for an entry", async function () {

        await this.template({ "search.html": `<h1>{{query}}</h1> {{#entries}} {{{html}}} {{/entries}}`});

        await this.write({path: '/a.txt', content: 'Hello, A!'});
        await this.write({path: '/b.txt', content: 'Hello, B!'});
        await this.write({path: '/c.txt', content: 'Hello, C!'});

        const res = await this.get('/search?q=hello');
        const body = await res.text();

        expect(res.status).toEqual(200);
        expect(body).toContain('Hello, A!');
        expect(body).toContain('Hello, B!');
        expect(body).toContain('Hello, C!');
        expect(body).toContain('hello');
    });



    it("does not error if there are multiple queries", async function () {
        
        await this.template({ "search.html": `<h1>{{query}}</h1> {{#entries}} {{{html}}} {{/entries}}`});

        await this.write({path: '/a.txt', content: 'Hello, A!'});

        const res = await this.get('/search?q=hello&q=a');
        const body = await res.text();

        expect(res.status).toEqual(200);
        expect(body).toContain('Hello, A!');
    }); 


    it("if there is no query it returns an empty list", async function () {
        
        await this.template({ "search.html": `<h1>{{query}}</h1> {{#entries}} {{{html}}} {{/entries}}`});

        await this.write({path: '/a.txt', content: 'Hello, A!'});

        const res = await this.get('/search');
        const body = await res.text();

        expect(res.status).toEqual(200);
        expect(body).toEqual('<h1></h1> '); 
    }); 

    it("if no entries match it returns an empty list", async function () {
        
        await this.template({ "search.html": `<h1>{{query}}</h1> {{#entries}} {{{html}}} {{/entries}}`});

        await this.write({path: '/a.txt', content: 'Hello, A!'});

        const res = await this.get('/search?q=goodbye');
        const body = await res.text();

        expect(res.status).toEqual(200);
        expect(body).not.toContain('Hello, A!');
        expect(body).toContain('goodbye');
    });




});