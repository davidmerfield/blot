const isAjaxRequest = (req = {}) => {
  return req.query && Object.prototype.hasOwnProperty.call(req.query, "ajax");
};

const sendAjaxResponse = (res, options = {}) => {
  const { status = 204, headers = {}, body } = options;
  res.set("Cache-Control", "no-store");

  if (headers && typeof headers === "object") {
    Object.keys(headers).forEach((key) => {
      if (headers[key] !== undefined) {
        res.set(key, headers[key]);
      }
    });
  }

  if (body !== undefined && body !== null) {
    return res.status(status).send(body);
  }

  return res.status(status).end();
};

module.exports = {
  isAjaxRequest,
  sendAjaxResponse,
};
