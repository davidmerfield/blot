
const ajax = require('../js/ajax.js');
const withAjax = ajax.withAjax;
const handleAjaxSaveResponse = ajax.handleAjaxSaveResponse;

// FONT PICKER

Array.from(document.querySelectorAll('form[id^="font_picker"]')).forEach(
  function (form) {
    form.querySelectorAll("input, select, button").forEach(function (node) {
      if (node.style.display === "none") return;

      const submitForm = (event) => {
        // construct the body based on the single input or button that was clicked
        const body = new URLSearchParams();

        body.append(node.name, node.value);

        // append the hidden inputs
        const csrfInput = form.querySelector('input[name="_csrf"]');
        if (csrfInput) body.append(csrfInput.name, csrfInput.value);

        fetch(withAjax(window.location.href), { method: "post", body }).then(
          handleAjaxSaveResponse
        );

        // if this was a button, we need to close the picker
        // and replace the innerHTML of show_picker with the new font
        if (node.tagName === "BUTTON") {
          node.parentNode.parentNode.querySelector(
            'input[id^="show_picker"]'
          ).checked = false;
          node.parentNode.parentNode.querySelector(
            'label[for^="show_picker"]'
          ).innerHTML = node.innerHTML;
        }

        event.preventDefault();
        return false;
      };

      // if a button, handle click
      if (node.tagName === "BUTTON") {
        node.addEventListener("click", submitForm);
        return;
      } else {
        node.addEventListener("change", submitForm);
        return;
      }
    });
  }
);
