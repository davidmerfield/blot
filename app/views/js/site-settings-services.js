const analyticsSelect = document.getElementById('selectAnalytics');

if (analyticsSelect) {

const trackingIdInput = document.getElementById('trackingIdInput');

function updateTrackingIdVisibility() {
  if (!trackingIdInput) {
    return;
  }

  const requiresTrackingId =
    analyticsSelect.value !== 'None' &&
    ['SimpleAnalytics', 'Plausible'].indexOf(analyticsSelect.value) === -1;

  if (!requiresTrackingId) {
    trackingIdInput.style.display = 'none';
    return;
  }

  const label = trackingIdInput.querySelector('span');
  if (label) {
    label.textContent = analyticsSelect.value === 'Cloudflare' ? 'Token:' : 'Tracking ID:';
  }

  trackingIdInput.style.display = 'block';
}

function submitPluginFormOnCheckboxChange(checkbox) {
  checkbox.addEventListener('change', function() {
    const form = checkbox.closest('form');
    const pluginRow = checkbox.closest('.plugin');

    if (pluginRow) {
      pluginRow.classList.toggle('checked', checkbox.checked);
    }

    if (!form) {
      return;
    }

    const xhr = new XMLHttpRequest();
    xhr.open('POST', form.action);
    xhr.send(new FormData(form));
  });
}

analyticsSelect.addEventListener('change', updateTrackingIdVisibility);
updateTrackingIdVisibility();

document
  .querySelectorAll('.plugin input[type=checkbox]')
  .forEach(submitPluginFormOnCheckboxChange);

}
