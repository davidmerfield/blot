const { getEntry } = require("../lib/models");
const attachAdjacent = require("../lib/attachAdjacent");
const drafts = require("sync/update/drafts");
const createRedisClient = require("models/redis");

// (node:73631) TimeoutOverflowWarning: 1.7976931348623157e+308 does not fit into a 32-bit signed integer.
// Timer duration was truncated to 2147483647.
const MAX_TIMEOUT = 2147483647;

async function renderDraft(req, res, next, filePath, callback) {
  const blog = req.blog;
  const blogID = blog.id;

  req.log("draft: fetching entry", `filePath=${filePath}`);
  const entry = await getEntry(blogID, filePath);
  if (!entry || !entry.draft || entry.deleted) {
    req.log("draft: entry not found or not a draft");
    return next();
  }
  req.log("draft: entry found", `entryId=${entry.id}`);

  // GET FULL ENTRY RETURNS NULL SINCE IT"S DRAFT
  // HOW DO WE RESOLVE THIS NEATLY? WHERE TO DRAW
  // THE LINE TO SHOW OR NOT TO SHOW?
  // PERHAPS PASS {drafts: show}? or something?

  req.log("draft: fetching adjacent entries");
  await attachAdjacent(blogID, entry);
  req.log("draft: adjacent entries fetched");
  res.locals.entry = entry;

  req.log("draft: rendering entry view");
  res.renderView("entry.html", next, function (err, output) {
    req.log("draft: entry view rendered, injecting script");
    drafts.injectScript(output, filePath, callback);
  });
}

module.exports = function register(blog) {
  blog.get(drafts.streamRoute, async function (req, res, next) {
    const blogID = req.blog.id;
    const client = createRedisClient();
    const filePath = drafts.getPath(req.url, drafts.streamRoute);
    let cleanedUp = false;

    const cleanup = async function () {
      if (cleanedUp) return;
      cleanedUp = true;

      try {
        if (client.isOpen) {
          await client.unsubscribe(channel);
        }
      } catch (e) {}

      try {
        if (client.isOpen) {
          await client.quit();
        }
      } catch (e) {}
    };

    req.socket.setTimeout(MAX_TIMEOUT);

    res.writeHead(200, {
      // This header tells NGINX to NOT
      // buffer the response. Otherwise
      // the messages don't make it to the client.
      // A similar problem to the one caused
      // by the compression middleware a few lines down.
      "X-Accel-Buffering": "no",
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });

    res.write("\n");

    const channel = "blog:" + blogID + ":draft:" + filePath;

    try {
      await client.connect();
      await client.subscribe(channel, function (_message, _channel) {
        renderDraft(req, res, next, filePath, function (html, bodyHTML) {
          try {
            res.write("\n");
            res.write("data: " + JSON.stringify(bodyHTML.trim()) + "\n\n");
            res.flushHeaders();
          } catch (e) {}
        }).catch(() => {});
      });
    } catch (err) {
      await cleanup();
      return next(err);
    }

    req.on("close", async function () {
      await cleanup();
    });
  });

  blog.get(drafts.viewRoute, async function (req, res, next) {
    req.log("draft: start", `url=${req.url}`);

    const filePath = drafts.getPath(req.url, drafts.viewRoute);

    // Asks search engines not to index drafts
    res.set("X-Robots-Tag", "noindex");
    res.set("Cache-Control", "no-cache");

    req.log("draft: rendering", `filePath=${filePath}`);
    try {
      await renderDraft(req, res, next, filePath, function (html) {
        // Remove the frame protection headers added by the server
        // middleware. They prevent Firefox from rendering the iframe
        // used in the preview file.
        res.removeHeader("X-Frame-Options");
        res.removeHeader("Content-Security-Policy");

        req.log("draft: complete", `htmlLength=${html ? html.length : 0}`);
        // bodyHTML is passed after HTML
        res.send(html);
      });
    } catch (err) {
      return next(err);
    }
  });
};
