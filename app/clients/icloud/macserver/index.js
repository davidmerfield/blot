const express = require("express");
const { raw } = express;
const { Authorization, maxFileSize } = require("./config");
const { initialize } = require("./watcher");
const notifyServerStarted = require("./httpClient/notifyServerStarted");
const clfdate = require("./util/clfdate");

const monitorer = require("./monitorer");

const asyncHandler = (handler) => (req, res, next) =>
  Promise.resolve(handler(req, res, next)).catch(next);

// maxFileSize is in bytes but limit must be in the format '5mb'
const limit = `${maxFileSize / 1000000}mb`;

const startServer = async () => {
  const app = express();

  app.use((req, res, next) => {
    console.log(clfdate(), `Request: ${req.method} ${req.url}`);

    const authorization = req.header("Authorization"); // New header for the Authorization secret

    if (authorization !== Authorization) {
      return res.status(403).send("Unauthorized");
    }

    next();
  });

  app.use(express.json());

  app.use(raw({ type: "application/octet-stream", limit }));

  app.post("/upload", asyncHandler(require("./routes/upload")));

  app.post("/evict", asyncHandler(require("./routes/evict")));

  app.post("/delete", asyncHandler(require("./routes/delete")));

  app.post("/mkdir", asyncHandler(require("./routes/mkdir")));

  app.post("/watch", asyncHandler(require("./routes/watch")));

  app.post("/disconnect", asyncHandler(require("./routes/disconnect")));

  app.get("/readdir", asyncHandler(require("./routes/readdir")));
  app.post("/recursiveList", asyncHandler(require("./routes/recursiveList")));

  app.get("/download", asyncHandler(require("./routes/download")));

  app.get("/stats", asyncHandler(require("./routes/stats")));

  app.post("/setup", asyncHandler(require("./routes/setup")));

  app.use((err, req, res, next) => {
    console.error(clfdate(), "Macserver error:", err);
    res.status(500).send("Internal Server Error");
  });

  app.listen(3000, () => {
    console.log(clfdate(), "Macserver is running on port 3000");
  });
};

// Main entry point
(async () => {
  try {

    // Test connectivity with the remote server
    console.log(clfdate(), "Pinging remote server...");
    try {
      await notifyServerStarted();
    } catch (error) {
      console.error(clfdate(), "Failed to ping remote server:", error);
    }

    // Start the local server
    console.log(clfdate(), "Starting macserver...");
    await startServer();

    // Initialize the file watcher
    console.log(clfdate(), "Initializing file watchers for existing folders...");
    await initialize();

    // Start the monitorer to keep iCloud in sync
    console.log(clfdate(), "Starting iCloud monitorer...");
    monitorer();
    
    console.log(clfdate(), "Macserver started successfully");
  } catch (error) {
    console.error(clfdate(), "Error starting macserver:", error);
    process.exit(1);
  }
})();
