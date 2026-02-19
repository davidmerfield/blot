const redirectsContainer = document.getElementById('redirects');
const redirectsForm = document.querySelector('form[action*="/settings/redirects"]');

if (!redirectsContainer && !redirectsForm) {
  return;
}

document
  .querySelectorAll('.buttons a, .buttons input, .buttons button')
  .forEach(function (button) {
    button.addEventListener('click', function (event) {
      event.target.classList.add('disabled');
    });
  });

function submitForm(form) {
  const xhr = new XMLHttpRequest();
  xhr.open('POST', form.action);
  xhr.onload = function () {};
  xhr.onerror = function () {};
  xhr.send(new FormData(form));
}

const checkboxes = document.querySelectorAll('.plugin input[type=checkbox]');
checkboxes.forEach(function (checkbox) {
  checkbox.addEventListener('change', function () {
    const form = this.closest('form');
    const plugin = this.closest('.plugin');

    if (!form) {
      return;
    }

    if (plugin) {
      plugin.classList.toggle('checked', this.checked);
    }

    submitForm(form);
  });
});
