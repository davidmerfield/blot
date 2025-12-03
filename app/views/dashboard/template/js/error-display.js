function getErrorElement(doc) {
  if (!doc || typeof doc.querySelector !== "function") return null;
  return doc.querySelector(".error");
}

function showError(doc, msg) {
  const el = getErrorElement(doc);
  if (!el) return false;

  el.textContent = msg || "An error occurred";
  el.style.display = "block";
  el.style.opacity = "1";
  return true;
}

function hideError(doc) {
  const el = getErrorElement(doc);
  if (!el) return false;

  el.style.display = "none";
  return true;
}

module.exports = {
  getErrorElement,
  showError,
  hideError,
};
