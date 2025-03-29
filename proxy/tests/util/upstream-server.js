const express = require("express");
const app = express();
const sharp = require("sharp");

app.get("/", (req, res) => {
  res.send("Hello Node!");
});

// dynamic route
app.use("/timestamp", (req, res) => {
  res.send(`${Date.now()}`);
});

app.use("/gzip", (req, res) => {
  res.send("abc ".repeat(1024));
});

app.get("/:filename.png", (req, res) => {
  const { filename } = req.params;

  res.set("Content-Type", "image/png");

  sharp({
    create: {
      width: 400,
      height: 200,
      channels: 4,
      background: { r: 255, g: 0, b: 0, alpha: 0.5 } // transparent red
    }
  })
    .png()
    .toBuffer()
    .then(data => {
      res.send(data);
    });
});

module.exports = ({ port }) => {
  return new Promise((resolve, reject) => {
    const server = app.listen(port, () => {
      resolve(server);
    });
  });
};
