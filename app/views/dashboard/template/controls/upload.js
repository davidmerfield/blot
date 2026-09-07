const ajax = require("../js/ajax.js");
const withAjax = ajax.withAjax;
const handleAjaxSaveResponse = ajax.handleAjaxSaveResponse;

const forms = document.querySelectorAll("form.upload-control");

forms.forEach((form) => {
  const fileInput = form.querySelector("[data-upload-input]");
  const clearButton = form.querySelector("[data-upload-clear]");
  const valueInput = form.querySelector("[data-upload-value]");

  if (fileInput) {
    fileInput.addEventListener("change", (event) => {
      if (!fileInput.files || !fileInput.files.length) {
        return;
      }

      const formData = new FormData(form);
      const action = form.getAttribute("action") || window.location.href;

      fetch(withAjax(action), {
        method: "post",
        body: formData,
        credentials: "same-origin",
      })
        .then(handleAjaxSaveResponse)
        .catch((err) => {
          console.error("Upload error:", err);
        });
    });
  }

  if (clearButton) {
    clearButton.addEventListener("click", (event) => {
      event.preventDefault();

      if (valueInput) {
        valueInput.value = "";
      }

      if (fileInput) {
        fileInput.value = "";
      }

      const formData = new FormData(form);

      if (fileInput) {
        formData.delete(fileInput.name);
      }

      if (valueInput) {
        formData.set(valueInput.name, "");
      }

      const action = form.getAttribute("action") || window.location.href;

      fetch(withAjax(action), {
        method: "post",
        body: formData,
        credentials: "same-origin",
      })
        .then(handleAjaxSaveResponse)
        .catch((err) => {
          console.error("Upload error:", err);
        });
    });
  }
});
