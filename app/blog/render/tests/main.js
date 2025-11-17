const main = require('../main');

describe('template engine main', () => {
    it('should render content with locals and partials', () => {
        const content = 'content {{locals}} {{> partials}}';
        const locals = { locals: 'locals' };
        const partials = { partials: 'partials' };
        expect(main).toBeDefined();
        expect(main(content, locals, partials)).toBe('content locals partials');
    });

    it('should throw error if content is not a string', () => {
        const content = 123;
        const locals = { locals: 'locals' };
        const partials = { partials: 'partials' };
        expect(() => main(content, locals, partials)).toThrow();
    });

    it('should throw error if locals is not an object', () => {
        const content = 'content {{locals}} {{> partials}}';
        const locals = 'locals';
        const partials = { partials: 'partials' };
        expect(() => main(content, locals, partials)).toThrow();
    });

    it('should throw an error if there is an infinite loop of partials', () => {
        const content = 'content {{> partials}}';
        const locals = {};
        const partials = { partials: content };
        expect(() => main(content, locals, partials)).toThrow(new Error('Your template has infinitely nested partials'));
    });

    it('should throw an error if there is an unclosed tag', () => {
        const content = 'content {{> partials}';
        const locals = {};
        const partials = {};
        expect(() => main(content, locals, partials)).toThrow(new Error('Your template has an unclosed tag'));
    });
});