module.exports = function route(server) {
  var Entry = require("models/entry");
  var Entries = require("models/entries");
  var drafts = require("sync/update/drafts");
  const createRedisClient = require("models/redis");

  // (node:73631) TimeoutOverflowWarning: 1.7976931348623157e+308 does not fit into a 32-bit signed integer.
  // Timer duration was truncated to 2147483647.
  const MAX_TIMEOUT = 2147483647;

  server.get(drafts.streamRoute, async function (req, res, next) {
    var blogID = req.blog.id;
    const client = createRedisClient();
    var path = drafts.getPath(req.url, drafts.streamRoute);
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
      "Connection": "keep-alive",
    });

    res.write("\n");

    var channel = "blog:" + blogID + ":draft:" + path;

    try {
      await client.connect();
      await client.subscribe(channel, function (_message, _channel) {
        renderDraft(req, res, next, path, function (html, bodyHTML) {
          try {
            res.write("\n");
            res.write("data: " + JSON.stringify(bodyHTML.trim()) + "\n\n");
            res.flushHeaders();
          } catch (e) {}
        });
      });
    } catch (err) {
      await cleanup();
      return next(err);
    }

    req.on("close", async function () {
      await cleanup();
    });
  });

  server.get(drafts.viewRoute, function (request, response, next) {
    request.log("draft: start", `url=${request.url}`);

    var filePath = drafts.getPath(request.url, drafts.viewRoute);

    // Asks search engines not to index drafts
    response.set("X-Robots-Tag", "noindex");
    response.set("Cache-Control", "no-cache");

    request.log("draft: rendering", `filePath=${filePath}`);
    renderDraft(request, response, next, filePath, function (html) {
      // Remove the frame protection headers added by the server
      // middleware. They prevent Firefox from rendering the iframe
      // used in the preview file.
      response.removeHeader("X-Frame-Options");
      response.removeHeader("Content-Security-Policy");

      request.log("draft: complete", `htmlLength=${html ? html.length : 0}`);
      // bodyHTML is passed after HTML
      response.send(html);
    });
  });

  function renderDraft(request, response, next, filePath, callback) {
    var blog = request.blog,
      blogID = blog.id;

    request.log("draft: fetching entry", `filePath=${filePath}`);

    Entry.get(blogID, filePath, function (entry) {
      if (!entry || !entry.draft || entry.deleted) {
        request.log("draft: entry not found or not a draft");
        return next();
      }
      request.log("draft: entry found", `entryId=${entry.id}`);

      // GET FULL ENTRY RETURNS NULL SINCE IT"S DRAFT
      // HOW DO WE RESOLVE THIS NEATLY? WHERE TO DRAW
      // THE LINE TO SHOW OR NOT TO SHOW?
      // PERHAPS PASS {drafts: show}? or something?

      request.log("draft: fetching adjacent entries");
      Entries.adjacentTo(
        blogID,
        entry.id,
        function (nextEntry, previousEntry, index) {
          request.log("draft: adjacent entries fetched");
          entry.next = nextEntry;
          entry.index = index;
          entry.previous = previousEntry;
          entry.adjacent = !!(nextEntry || previousEntry);

          response.locals.entry = entry;

          request.log("draft: rendering entry view");
          response.renderView("entry.html", next, function (err, output) {
            request.log("draft: entry view rendered, injecting script");
            drafts.injectScript(output, filePath, callback);
          });
        }
      );
    });
  }
};
