module.exports = function route(server) {
  var Entry = require("models/entry");
  var Entries = require("models/entries");
  var drafts = require("sync/update/drafts");
  var redis = require("models/redis");

  // (node:73631) TimeoutOverflowWarning: 1.7976931348623157e+308 does not fit into a 32-bit signed integer.
  // Timer duration was truncated to 2147483647.
  const MAX_TIMEOUT = 2147483647;

  server.get(drafts.streamRoute, function (req, res, next) {
    var blogID = req.blog.id;
    var client = new redis();
    var path = drafts.getPath(req.url, drafts.streamRoute);

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

    client.subscribe(channel);

    client.on("message", function (_channel) {
      renderDraft(req, res, next, path, function (html, bodyHTML) {
        try {
          res.write("\n");
          res.write("data: " + JSON.stringify(bodyHTML.trim()) + "\n\n");
          res.flushHeaders();
        } catch (e) {}
      });
    });

    req.on("close", function () {
      client.unsubscribe();
      client.quit();
    });
  });

  server.get(drafts.viewRoute, function (request, response, next) {
    // console.log('Draft: Request to a draft view page ' + request.url);

    var filePath = drafts.getPath(request.url, drafts.viewRoute);

    // Asks search engines not to index drafts
    response.set("X-Robots-Tag", "noindex");
    response.set("Cache-Control", "no-cache");

    renderDraft(request, response, next, filePath, function (html) {
      // Remove the frame protection headers added by the server
      // middleware. They prevent Firefox from rendering the iframe
      // used in the preview file.
      response.removeHeader("X-Frame-Options");
      response.removeHeader("Content-Security-Policy");

      // bodyHTML is passed after HTML
      response.send(html);
    });
  });

  function renderDraft(request, response, next, filePath, callback) {
    var blog = request.blog,
      blogID = blog.id;

    // console.log('Draft: Rendering draft HTML for entry at: ' + filePath);

    Entry.get(blogID, filePath, function (entry) {
      if (!entry || !entry.draft || entry.deleted) return next();

      // GET FULL ENTRY RETURNS NULL SINCE IT"S DRAFT
      // HOW DO WE RESOLVE THIS NEATLY? WHERE TO DRAW
      // THE LINE TO SHOW OR NOT TO SHOW?
      // PERHAPS PASS {drafts: show}? or something?

      Entries.adjacentTo(
        blogID,
        entry.id,
        function (nextEntry, previousEntry, index) {
          entry.next = nextEntry;
          entry.index = index;
          entry.previous = previousEntry;
          entry.adjacent = !!(nextEntry || previousEntry);

          response.locals.entry = entry;

          response.renderView("entry.html", next, function (err, output) {
            drafts.injectScript(output, filePath, callback);
          });
        }
      );
    });
  }
};
