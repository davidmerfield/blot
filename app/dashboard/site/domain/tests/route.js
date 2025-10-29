const nock = require('nock');
const Domain = require('../index');

function getPostHandler() {
    const layer = Domain.stack.find(l => l.route && l.route.path === '/' && l.route.methods.post);
    return layer && layer.route.stack[0].handle;
}

describe('domain route POST handler', function () {
    let originalVerify;
    let originalUpdateDomain;
    let originalTriggerAutoSSL;
    let postHandler;

    beforeEach(function () {
        originalVerify = Domain.verify;
        originalUpdateDomain = Domain.updateDomain;
        originalTriggerAutoSSL = Domain.triggerAutoSSL;
        postHandler = Domain._handlePost || getPostHandler();
        nock.cleanAll();
    });

    afterEach(function () {
        Domain.verify = originalVerify;
        Domain.updateDomain = originalUpdateDomain;
        Domain.triggerAutoSSL = originalTriggerAutoSSL;
        nock.cleanAll();
    });

    it('pings the saved domain to trigger AutoSSL', async function () {
        Domain.verify = jasmine.createSpy('verify').and.returnValue(Promise.resolve(true));
        Domain.updateDomain = jasmine.createSpy('updateDomain').and.returnValue(Promise.resolve());

        const scope = nock('https://example.com')
            .head('/')
            .reply(200);

        const req = {
            blog: { id: 'blog123', handle: 'handle', domain: null, pretty: {} },
            body: { domain: 'example.com' },
            session: {}
        };

        req.session.save = jasmine.createSpy('save');

        const res = {
            locals: { base: '/sites/handle' },
            message: jasmine.createSpy('message'),
            redirect: jasmine.createSpy('redirect')
        };

        await postHandler(req, res);

        await new Promise(resolve => setImmediate(resolve));

        expect(Domain.updateDomain).toHaveBeenCalledWith('blog123', 'example.com');
        expect(scope.isDone()).toBe(true);
        expect(res.message).toHaveBeenCalledWith('/sites/handle/domain', 'Domain added');
    });
});
