var siteOwner = "SITE";

const setView = require("./setView");

module.exports = {
  create: require("./create"),
  update: require("./update"),
  getMetadata: require("./getMetadata"),
  setMetadata: require("./setMetadata"),

  getFullView: require("./getFullView"),
  getView: require("./getView"),
  getViewByURL: require("./getViewByURL"),
  setView,
  dropView: require("./dropView"),
  getPartials: require("./getPartials"),
  getAllViews: require("./getAllViews"),
  getTemplateList: require("./getTemplateList"),

  createShareID: require("./createShareID"),
  dropShareID: require("./dropShareID"),
  getByShareID: require("./getByShareID"),

  drop: require("./drop"),

  makeID: require("./util/makeID"),
  isOwner: require("./isOwner"),
  siteOwner: siteOwner,

  buildFromFolder: require("./buildFromFolder"),
  readFromFolder: require("./readFromFolder"),
  writeToFolder: require("./writeToFolder"),
  removeFromFolder: require("./removeFromFolder"),
  
  package: require("./package"),
  viewModel: require("./viewModel"),
  metadataModel: require("./metadataModel"),
  MAX_VIEW_CONTENT_BYTES: setView.MAX_VIEW_CONTENT_BYTES,
  VIEW_TOO_LARGE_ERROR_CODE: setView.VIEW_TOO_LARGE_ERROR_CODE,
  VIEW_TOO_LARGE_MESSAGE: setView.VIEW_TOO_LARGE_MESSAGE,
};
