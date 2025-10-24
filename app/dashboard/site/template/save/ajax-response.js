const isAjaxRequest = (req = {}) => {
  return req.query && Object.prototype.hasOwnProperty.call(req.query, "ajax");
};

const sendAjaxResponse = (res, status = 204) => {
  res.set("Cache-Control", "no-store");
  return res.status(status).end();
};

module.exports = {
  isAjaxRequest,
  sendAjaxResponse,
};
