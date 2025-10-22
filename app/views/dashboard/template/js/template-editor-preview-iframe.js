var previewIframeContainer = document.querySelector(".iframe-container");

if (previewIframeContainer) {

    var previewOrigin = previewIframeContainer.getAttribute("data-origin");
    var csrfToken = previewIframeContainer.getAttribute("data-csrf");
  var iframeContainerWidth = previewIframeContainer.offsetWidth;
  document.documentElement.style.setProperty(
    "--iframe-container-width",
    iframeContainerWidth
  );
  window.addEventListener("resize", function () {
    var iframeContainerWidth =
      document.querySelector(".iframe-container").offsetWidth;
    document.documentElement.style.setProperty(
      "--iframe-container-width",
      iframeContainerWidth
    );
  });

  var content = document.querySelector("iframe");

  var doc = document.querySelector("iframe").contentWindow.document;

  // Listen to messages sent from the iframe which contains
  // the preview of the template. We inject the script
  // which sends these messages before the </body> tag of
  // all HTML pages rendered on preview subdomains.
  var receiveMessage = function receiveMessage(e) {

    // Only react to messages from the preview subdomain
    // The user can click on links and load external pages
    if (e.origin !== previewOrigin) return;

    // Extract the path of the page they are viewing
    let path = e.data.slice("iframe:".length);

    // Save the path they have viewed on the server
    var http = new XMLHttpRequest();
    var url = previewIframeContainer.getAttribute("data-base");
    var params = "previewPath=" + path + "&_csrf=" + csrfToken;
    http.open("POST", url, true);
    http.setRequestHeader("Content-type", "application/x-www-form-urlencoded");
    http.send(params);
  };

  window.addEventListener("message", receiveMessage, false);
}
