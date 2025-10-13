const express = require("express");
const { spawn } = require("child_process");
const path = require("path");

const PORT = Number(process.env.LOCAL_OPEN_FOLDER_PORT) || 3020;
const REPO_ROOT = path.resolve(__dirname, "../../");
const RATE_LIMIT_WINDOW_MS = 5 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 5;

const openerForPlatform = () => {
  if (process.platform === "darwin") return "open";
  if (process.platform === "win32") return "explorer";
  return "xdg-open";
};

const app = express();

const requestLog = new Map();

app.use((req, res, next) => {
  const key = req.ip || "unknown";
  const now = Date.now();
  const recentRequests = (requestLog.get(key) || []).filter(
    (timestamp) => now - timestamp < RATE_LIMIT_WINDOW_MS
  );

  if (recentRequests.length >= RATE_LIMIT_MAX_REQUESTS) {
    return res
      .status(429)
      .json({ error: "Too many open-folder requests. Please slow down." });
  }

  recentRequests.push(now);
  requestLog.set(key, recentRequests);

  next();
});

app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.sendStatus(204);

  next();
});

app.use(express.json());

const resolveRequestedPath = (req) => {
  const { blogID, path: queryPath } = req.query || {};

  if (typeof blogID === "string" && blogID.trim()) {
    return path.join("data", "blogs", blogID.trim());
  }

  if (req.method === "POST") {
    const { path: bodyPath } = req.body || {};
    if (bodyPath && typeof bodyPath === "string") {
      return bodyPath;
    }
  }

  if (typeof queryPath === "string" && queryPath.trim()) {
    return queryPath.trim();
  }

  return null;
};

const handleOpenFolder = (req, res) => {
  try {
    const relativePath = resolveRequestedPath(req);

    if (!relativePath) {
      return res.status(400).json({ error: "Missing folder path" });
    }

    const resolved = path.resolve(REPO_ROOT, relativePath);

    if (!resolved.startsWith(REPO_ROOT + path.sep) && resolved !== REPO_ROOT) {
      return res.status(400).json({ error: "Path must be within the repository" });
    }

    const openerCommand = openerForPlatform();
    const opener = spawn(openerCommand, [resolved], {
      stdio: "ignore",
      detached: true,
    });

    let finished = false;

    const fail = (error) => {
      if (finished) return;
      finished = true;
      console.error("Failed to open folder", error);
      res.status(500).json({ error: "Failed to open folder" });
    };

    opener.once("error", fail);
    opener.once("spawn", () => {
      if (finished) return;
      finished = true;
      opener.unref();
      res.json({ status: "opening" });
    });
  } catch (error) {
    console.error("Error handling open-folder request", error);
    res.status(500).json({ error: "Unexpected error" });
  }
};

app.post("/open-folder", handleOpenFolder);
app.get("/open-folder", handleOpenFolder);

app.listen(PORT, () => {
  console.log(`Open folder server listening on http://localhost:${PORT}`);
});
