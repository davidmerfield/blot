const http = require("http");
const { spawn } = require("child_process");
const path = require("path");

const PORT = Number(process.env.LOCAL_OPEN_FOLDER_PORT) || 3020;
const BLOGS_DIR = path.resolve(__dirname, "../../data/blogs");

http
  .createServer((req, res) => {
    const url = new URL(req.url, "http://localhost");

    if (req.method !== "GET" || url.pathname !== "/open-folder") {
      res.statusCode = 404;
      return res.end();
    }

    const blogID = (url.searchParams.get("blogID") || "").trim();

    if (!blogID) {
      res.statusCode = 400;
      return res.end("Missing blogID");
    }

    spawn("open", [path.join(BLOGS_DIR, blogID)], {
      detached: true,
      stdio: "ignore",
    }).unref();

    res.end("ok");
  })
  .listen(PORT, () => {
    console.log(`[start] Launched local folder opener`);
  });
