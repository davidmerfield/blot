const express = require("express");
const { spawn } = require("child_process");
const path = require("path");

const PORT = Number(process.env.LOCAL_OPEN_FOLDER_PORT) || 3020;
const REPO_ROOT = path.resolve(__dirname, "../../");

const openerForPlatform = () => {
  if (process.platform === "darwin") return "open";
  if (process.platform === "win32") return "explorer";
  return "xdg-open";
};

const app = express();

app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.sendStatus(204);

  next();
});

app.use(express.json());

app.post("/open-folder", (req, res) => {
  try {
    const { path: relativePath } = req.body || {};

    if (!relativePath || typeof relativePath !== "string") {
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
});

app.listen(PORT, () => {
  console.log(`Open folder server listening on http://localhost:${PORT}`);
});
