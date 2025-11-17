const ajax = require("../js/ajax.js");
const withAjax = ajax.withAjax;
const handleAjaxSaveResponse = ajax.handleAjaxSaveResponse;

// boolean inputs
document.querySelectorAll("form.boolean").forEach(function (form) {
  form.querySelectorAll("input").forEach(function (node) {
    node.addEventListener("change", (event) => {
      // construct the body based on the single input or button that was clicked
      const body = new URLSearchParams();

      // why is this always 'on'?
      // because the value is set to 'on' in the template
      body.append(node.name, node.checked ? "on" : "off");
      // append the csrf token
      body.append("_csrf", form.querySelector('input[name="_csrf"]').value);

      fetch(withAjax(window.location.href), { method: "post", body }).then(
        handleAjaxSaveResponse
      );

      event.preventDefault();
      return false;
    });
  });
});
