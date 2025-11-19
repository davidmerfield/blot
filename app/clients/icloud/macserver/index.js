const express = require("express");
const { raw } = express;
const { Authorization, maxFileSize } = require("./config");
const { initialize } = require("./watcher");
const notifyServerStarted = require("./httpClient/notifyServerStarted");

const monitorer = require("./monitorer");

// maxFileSize is in bytes but limit must be in the format '5mb'
const limit = `${maxFileSize / 1000000}mb`;

const startServer = async () => {
  const app = express();

  app.use((req, res, next) => {
    console.log(`Request: ${req.method} ${req.url}`);

    const authorization = req.header("Authorization"); // New header for the Authorization secret

    if (authorization !== Authorization) {
      return res.status(403).send("Unauthorized");
    }

    next();
  });

  app.use(express.json());

  app.use(raw({ type: "application/octet-stream", limit }));

  app.post("/upload", require("./routes/upload"));
  
  app.post("/evict", require("./routes/evict"));

  app.post("/delete", require("./routes/delete"));

  app.post("/mkdir", require("./routes/mkdir"));

  app.post("/watch", require("./routes/watch"));

  app.post("/disconnect", require("./routes/disconnect"));

  app.get("/readdir", require("./routes/readdir"));
  app.post("/recursiveList", require("./routes/recursiveList"));

  app.get("/download", require("./routes/download"));

  app.get("/stats", require("./routes/stats"));

  app.post("/setup", require("./routes/setup"));

  app.listen(3000, () => {
    console.log("Macserver is running on port 3000");
  });
};

// Main entry point
(async () => {
  try {

    // Test connectivity with the remote server
    console.log("Pinging remote server...");
    try {
      await notifyServerStarted();
    } catch (error) {
      console.error("Failed to ping remote server:", error);
    }

    // Start the local server
    console.log("Starting macserver...");
    await startServer();

    // Initialize the file watcher
    console.log("Initializing file watchers for existing folders...");
    await initialize();

    // Start the monitorer to keep iCloud in sync
    console.log("Starting iCloud monitorer...");
    monitorer();
    
    console.log("Macserver started successfully");
  } catch (error) {
    console.error("Error starting macserver:", error);
    process.exit(1);
  }
})();
