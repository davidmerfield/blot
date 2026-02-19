module.exports = function handleCookieRedirect() {
  const redirectTarget = document
    .querySelector('meta[name="blot-cookie-redirect"]')
    ?.getAttribute('content');

  if (!redirectTarget) {
    return;
  }

  window.location = redirectTarget;
};
