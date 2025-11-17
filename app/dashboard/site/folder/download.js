const { basename } = require("path");
const localPath = require("helper/localPath");

module.exports = (req, res) => {
  try {
    const local = localPath(req.blog.id, req.params.path.normalize("NFC"));
    const filename = basename(local);

    // add the headers to download the file
    res.setHeader(
      "Content-disposition",
      "attachment; filename=" + encodeURIComponent(filename)
    );

    res.sendFile(local);
  } catch (e) {
    res.status(404).send("Error downloading file");
  }
};
