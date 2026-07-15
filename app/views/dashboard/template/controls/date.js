const ajax = require("../js/ajax.js");
const withAjax = ajax.withAjax;
const handleAjaxSaveResponse = ajax.handleAjaxSaveResponse;

document.querySelectorAll("#dateSettings").forEach(function (form) {
  const container = form.querySelector("#date_display_container");
  const hideDatesCheckbox = form.querySelector("#hide_dates_checkbox");

  form
    .querySelectorAll("input:not([type=hidden]), select")
    .forEach(function (node) {
      node.addEventListener("change", (event) => {
        const body = new URLSearchParams();

        if (node.type === "checkbox") {
          body.append(node.name, node.checked ? "on" : "off");
        } else {
          body.append(node.name, node.value);
        }

        const csrfInput = form.querySelector('input[name="_csrf"]');
        if (csrfInput) body.append(csrfInput.name, csrfInput.value);

        // Immediately show/hide date_display when hide_dates checkbox is toggled
        if (node === hideDatesCheckbox && container) {
          container.style.display = hideDatesCheckbox.checked ? "none" : "flex";
        }

        fetch(withAjax(window.location.href), { method: "post", body }).then(
          handleAjaxSaveResponse
        );
        event.preventDefault();
        return false;
      });
    });
});
