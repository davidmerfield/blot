const { getEntry } = require("../lib/models");
const attachAdjacent = require("../lib/attachAdjacent");
const drafts = require("sync/update/drafts");
const redisSubscriber = require("helper/redisSubscriber");

// (node:73631) TimeoutOverflowWarning: 1.7976931348623157e+308 does not fit into a 32-bit signed integer.
// Timer duration was truncated to 2147483647.
const MAX_TIMEOUT = 2147483647;

async function renderDraft(req, res, next, filePath, callback) {
  const blog = req.blog;
  const blogID = blog.id;

  const entry = await getEntry(blogID, filePath);
  if (!entry || !entry.draft || entry.deleted) return next();

  await attachAdjacent(blogID, entry);
  res.locals.entry = entry;

  await new Promise(function (resolve) {
    function renderNext(err) {
      next(err);
      resolve();
    }

    res.renderView("entry.html", renderNext, function (_err, output) {
      drafts.injectScript(output, filePath, function (html, bodyHTML) {
        callback(html, bodyHTML);
        resolve();
      });
    });
  });
}

function createRenderQueue({ render, isClosed }) {
  let rendering = false;
  let renderPending = false;

  async function drain() {
    if (rendering || isClosed()) return;
    rendering = true;
    do {
      renderPending = false;
      if (isClosed()) break;
      try {
        await render();
      } catch (err) {}
    } while (renderPending && !isClosed());
    rendering = false;
  }

  return {
    notify: function () {
      if (isClosed()) return;
      renderPending = true;
      void drain();
    },
    clear: function () {
      renderPending = false;
    },
  };
}

module.exports = function register(blog) {
  blog.get(drafts.streamRoute, async function (req, res, next) {
    const blogID = req.blog.id;
    const filePath = drafts.getPath(req.url, drafts.streamRoute);
    let closed = false;

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

    function responseIsClosed() {
      return closed || res.destroyed || res.writableEnded;
    }

    const renderQueue = createRenderQueue({
      isClosed: responseIsClosed,
      render: async function () {
        if (responseIsClosed()) return;
        await renderDraft(req, res, next, filePath, function (_html, bodyHTML) {
          if (responseIsClosed()) return;
          try {
            res.write("\n");
            res.write("data: " + JSON.stringify(bodyHTML.trim()) + "\n\n");
            res.flushHeaders();
          } catch (e) {}
        }).catch(function () {});
      },
    });

    const subscription = redisSubscriber({
      channel,
      onMessage: function () {
        renderQueue.notify();
      },
      onError: next,
    });

    function cleanup() {
      if (closed) return;
      closed = true;
      renderQueue.clear();
      req.removeListener("close", cleanup);
      req.removeListener("aborted", cleanup);
      res.removeListener("close", cleanup);
      void subscription.cleanup();
    }

    req.on("close", cleanup);
    req.on("aborted", cleanup);
    res.on("close", cleanup);
  });

  blog.get(drafts.viewRoute, async function (req, res, next) {
    const filePath = drafts.getPath(req.url, drafts.viewRoute);

    // Asks search engines not to index drafts
    res.set("X-Robots-Tag", "noindex");
    res.set("Cache-Control", "no-cache");

    try {
      await renderDraft(req, res, next, filePath, function (html) {
        // Remove the frame protection headers added by the server
        // middleware. They prevent Firefox from rendering the iframe
        // used in the preview file.
        res.removeHeader("X-Frame-Options");
        res.removeHeader("Content-Security-Policy");

        // bodyHTML is passed after HTML
        res.send(html);
      });
    } catch (err) {
      return next(err);
    }
  });
};

module.exports.createRenderQueue = createRenderQueue;
