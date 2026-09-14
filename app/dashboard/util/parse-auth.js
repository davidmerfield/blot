const express = require("express");

// Auth forms only contain a handful of short fields. Keep these requests
// separate from the dashboard's larger parser, which is needed for uploads
// and template editing.
module.exports = express.urlencoded({
  extended: false,
  limit: "4kb",
  parameterLimit: 10,
});
