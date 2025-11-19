const http = require("http");
const { spawn } = require("child_process");
const path = require("path");
const os = require("os");

const PORT = Number(process.env.LOCAL_OPEN_FOLDER_PORT) || 3020;
const BLOGS_DIR = path.resolve(__dirname, "../../data/blogs");

// Map client types to their folder paths in development
const CLIENT_FOLDERS = {
  dropbox: path.join(os.homedir(), "/Library/CloudStorage/Dropbox/Apps/Blot\ test"),
  "google-drive": path.join(os.homedir(), "/Library/CloudStorage/GoogleDrive-dmerfield@gmail.com/My\ Drive/Sites"),
  icloud: path.join(os.homedir(), "/Library/Mobile\ Documents/com~apple~CloudDocs/Sites"),
};

http
  .createServer((req, res) => {
    const url = new URL(req.url, "http://localhost");

    if (req.method !== "GET" || url.pathname !== "/open-folder") {
      res.statusCode = 404;
      return res.end();
    }

    const blogID = (url.searchParams.get("blogID") || "").trim();
    const client = (url.searchParams.get("client") || "").trim();

    if (!blogID) {
      res.statusCode = 400;
      return res.end("Missing blogID");
    }

    let folderPath;

    if (client && CLIENT_FOLDERS[client]) {
      // For cloud clients, open the base folder (not blog-specific)
      folderPath = CLIENT_FOLDERS[client];
    } else {
      // For local client (or no client specified), open the blog-specific folder
      folderPath = path.join(BLOGS_DIR, blogID);
    }

    console.log('OPENING', folderPath);
    spawn("open", [folderPath], {
      detached: true,
      stdio: "ignore",
    }).unref();

    res.end("ok");
  })
  .listen(PORT, () => {
    console.log(`[start] Launched local folder opener`);
  });
