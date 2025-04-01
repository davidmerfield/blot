
const contactForm = document.getElementById('contact-form');

if (contactForm) {

  const emailInput = contactForm.querySelector('input[name="contact_7d45"]');
  const emailToggle = contactForm.querySelector('input[type="checkbox"][name="emailToggle"]');

  if (emailToggle){ 

  // when the email checkbox is checked, show the email input
  emailToggle.addEventListener('change', function(e) {
    emailInput.parentElement.style.display = e.target.checked ? 'block' : 'none';
    // focus the email input if it's shown
    if (e.target.checked) {
      emailInput.focus();
    }
  });
  
  // if the input is checked on page load, show the email input
  if (emailToggle.checked) {
    emailInput.parentElement.style.display = 'block';
  }
    
  }

// when the form button is clicked, submit the form in the background and replace the form html 
// with a success message or error message. ensure the server recieves the same data if js is 
contactForm.addEventListener('submit', function(e) {
  e.preventDefault();
  var form = e.target;
  console.log(form);
  var formData = new FormData(form);
  console.log(formData);
  var xhr = new XMLHttpRequest();
  xhr.open('POST', form.action, true);
  xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
  xhr.onreadystatechange = function() {
    if (xhr.readyState === 4) {
      if (xhr.status === 200) {
        // replace the text in the p tag before the form with a success message
        // ' Your message has been sent. Thank you! '
        form.previousElementSibling.innerHTML = 'Your message has been sent. Thank you!'
        form.style.display = 'none';
      } else {
        // replace the text in the p tag before the form with an error message
        // ' There was an error sending your message. Please try again. '
        form.previousElementSibling.innerHTML = 'There was an error sending your message. Please try again.'
        form.style.display = 'none';
      }
    }
  };
  xhr.send(new URLSearchParams(formData).toString());
});
}