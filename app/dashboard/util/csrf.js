const crypto = require('crypto');

module.exports = (req, res, next) => {
    // Skip CSRF for non-mutation requests
    if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
        setupToken();
        return next();
    }

    // Validate token for mutation requests
    const cookieToken = req.cookies?.csrf;
    const bodyToken = req.body?._csrf;

    console.log('Cookie Token:', cookieToken);
    console.log('Body Token:', bodyToken);
    
    if (!cookieToken || !bodyToken || cookieToken !== bodyToken) {
        return res.status(403).send('Invalid CSRF token');
    }

    setupToken();
    next();

    function setupToken() {
        if (!req.cookies?.csrf) {
            const token = crypto.randomBytes(32).toString('hex');
            res.cookie('csrf', token, {
                httpOnly: true,
                secure: true,
                sameSite: 'strict'
            });
            res.locals.csrftoken = token;
        } else {
            res.locals.csrftoken = req.cookies.csrf;
        }
    }
};