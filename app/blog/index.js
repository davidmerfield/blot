const renderView = require("./render/middleware");
const express = require("express");

// This serves the content of users' blogs
const blog = express.Router();

blog.use((req, res, next) => {
  req.log = req.log || console.log;
  res.locals.partials = res.locals.partials || {};
  next();
});

// Custom domain & subdomain middleware
// also handles the mapping of preview domains
blog.use(require("./vhosts"));

// Load in the rendering engine
blog.use(renderView);

blog.use(require('./loadTemplate'));

// The order of these routes is important
require("./draft")(blog);
require("./tagged")(blog);

blog.get('/search', require('./search'));

require("./robots")(blog);

// By checking for entries before template files
// we can allow the user to intercept their site's
// index page on their template with a page whose
// metadata sets 'Link: /`.
blog.use(require("./entry"));
blog.use(require("./view"));

blog.get("/page/:page", require("./entries"));
blog.get("/", require("./entries"));

blog.use(require("./assets"));
blog.use('/random', require('./random'));
require("./error")(blog);

module.exports = blog;
