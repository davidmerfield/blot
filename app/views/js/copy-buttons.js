const initCopyButtons = function () {
  const copyButtons = document.querySelectorAll("button.copy");

  copyButtons.forEach(function (button) {

    // check that the attribute 'data-copy-init' is unset
    if (button.getAttribute("data-copy-init") === "true") {
      return; // already initialized
    }

    // set the attribute 'data-copy-init' to true
    button.setAttribute("data-copy-init", "true");
    
    button.addEventListener("click", function (event) {
      // ensure all other copy buttons are reset
      copyButtons.forEach(function (button) {
        button.classList.remove("copied");
        button.innerHTML = button.innerHTML.replace("Copied", "Copy");
      });

      const target = event.target;
      const auxilary = document.createElement("input");
      auxilary.setAttribute("type", "text");
      auxilary.setAttribute("readonly", "");
      auxilary.style.position = "absolute";
      auxilary.style.left = "-9999px";
      // get the text from the attribute 'data-copy' or
      // from the text node previous to the button
      const text =
        target.getAttribute("data-copy") ||
        target.previousSibling.textContent.trim();
      auxilary.setAttribute("value", text);
      document.body.appendChild(auxilary);
      auxilary.select();
      document.execCommand("copy");
      document.body.removeChild(auxilary);
      // replace 'Copy' in the button with 'Copied!'
      const originalText = target.innerHTML;
      target.classList.add("copied");
      target.innerHTML = originalText.replace("Copy", "Copied");
      setTimeout(function () {
        target.classList.remove("copied");
        target.innerHTML = originalText;
      }, 2000);
    });
  });
};

initCopyButtons();

window.initCopyButtons = initCopyButtons;