import { watch } from "../watcher/index.js";
import clfdate from "../util/clfdate.js";

export default async (req, res) => {
  const blogID = req.header("blogID");

  if (!blogID) {
    console.error(clfdate(), "Missing blogID header for watch request");
    return res.status(400).send("Missing blogID header");
  }

  try {
    // watch the blog
    await watch(blogID);
  } catch (error) {
    console.error(clfdate(), `Failed to watch blogID (${blogID}):`, error);
    return res.status(500).send("Failed to watch blog folder");
  }

  console.log(clfdate(), `Recieved watch request for: ${blogID}`);
  res.sendStatus(200);
};
