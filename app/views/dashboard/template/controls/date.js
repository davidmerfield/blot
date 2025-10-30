const ajax = require("../js/ajax.js");
const withAjax = ajax.withAjax;
const handleAjaxSaveResponse = ajax.handleAjaxSaveResponse;

document.querySelectorAll("#dateSettings").forEach(function (form) {
  form.querySelectorAll("input, select").forEach(function (node) {
    node.addEventListener("change", (event) => {
      const body = new URLSearchParams();

      if (node.type === "checkbox") {
        body.append(node.name, node.checked ? "on" : "off");
      } else {
        body.append(node.name, node.value);
      }

      const csrfInput = form.querySelector('input[name="_csrf"]');
      if (csrfInput) body.append(csrfInput.name, csrfInput.value);

      fetch(withAjax(window.location.href), { method: "post", body }).then(
        handleAjaxSaveResponse
      );
      event.preventDefault();
      return false;
    });
  });
});
