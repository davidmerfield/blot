describe("render", function () {

    require('../../tests/util/setup')();

    it("minifies javascript", async function () {
        
        await this.template({
            'script.js': `var body = document.body;

                Element.prototype.addClass = function (classToAdd) {
                var classes = this.className.split(' ')
                if (classes.indexOf(classToAdd) === -1) classes.push(classToAdd)
                this.className = classes.join(' ')
                }

                Element.prototype.removeClass = function (classToRemove) {
                var classes = this.className.split(' ')
                var idx =classes.indexOf(classToRemove)
                if (idx !== -1) classes.splice(idx,1)
                this.className = classes.join(' ')
                }

                document.getElementById('open-nav').onclick = function (e){
                body.addClass('nav-is-open');
                e.preventDefault();
                return false;
                };

                document.getElementById('close-nav').onclick = function (e){
                body.removeClass('nav-is-open');
                e.preventDefault();
                return false;
                };


                var scrollpos = window.scrollY;
                var top_button = document.getElementById('top_button');

                function add_class_on_scroll(el){ el.classList.add("show")}
                function remove_class_on_scroll (el){ el.classList.remove("show")}
                `});

        const res = await this.get('/script.js');
        const body = await res.text();

        expect(res.status).toEqual(200);
        expect(body.trim()).toEqual('var body=document.body;Element.prototype.addClass=function(e){var s=this.className.split(" ");s.indexOf(e)===-1&&s.push(e),this.className=s.join(" ")},Element.prototype.removeClass=function(e){var s=this.className.split(" "),n=s.indexOf(e);n!==-1&&s.splice(n,1),this.className=s.join(" ")},document.getElementById("open-nav").onclick=function(e){return body.addClass("nav-is-open"),e.preventDefault(),!1},document.getElementById("close-nav").onclick=function(e){return body.removeClass("nav-is-open"),e.preventDefault(),!1};var scrollpos=window.scrollY,top_button=document.getElementById("top_button");function add_class_on_scroll(e){e.classList.add("show")}function remove_class_on_scroll(e){e.classList.remove("show")}');
    });

    it("leaves invalid javascript alone", async function () {
        
        await this.template({
            'script.js': 'function foo() {\n\nconsole.log("foo");\n\n'
        });

        const res = await this.get('/script.js');
        const body = await res.text();

        expect(res.status).toEqual(200);
        expect(body).toEqual('function foo() {\n\nconsole.log("foo");\n\n');
    });
    
    it("leaves empty javascript as-is", async function () {
        
        await this.template({
            'script.js': ''
        });

        const res = await this.get('/script.js');
        const body = await res.text();

        expect(res.status).toEqual(200);
        expect(body).toEqual('');
    });    

    it("minifies css", async function () {
        
        await this.template({
            'style.css': `body {
                background-color: lightblue;
                }

                h1 {
                color: white;
                text-align: center;
                }`
        });

        const res = await this.get('/style.css');
        const body = await res.text();

        expect(res.status).toEqual(200);
        expect(body.trim()).toEqual('body{background-color:#add8e6}h1{color:#fff;text-align:center}');
    });

    it("leaves invalid css alone", async function () {
        
        await this.template({
            'style.css': 'body {  ^^**&* background-color: ! lightblue;'
        });

        const res = await this.get('/style.css');
        const body = await res.text();

        expect(res.status).toEqual(200);
        expect(body).toEqual('body {  ^^**&* background-color: ! lightblue;');
    });

    it("leaves empty css as-is", async function () {
        
        await this.template({
            'style.css': ''
        });

        const res = await this.get('/style.css');
        const body = await res.text();

        expect(res.status).toEqual(200);
        expect(body).toEqual('');
    });
});