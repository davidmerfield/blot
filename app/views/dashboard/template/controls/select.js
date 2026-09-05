const ajax = require('../js/ajax.js');
const withAjax = ajax.withAjax;
const handleAjaxSaveResponse = ajax.handleAjaxSaveResponse;

// select inputs
document.querySelectorAll('form.select:not(.syntax-highlighter)').forEach(function(form){
	form.querySelectorAll('select').forEach(function(node){
	  node.addEventListener('change',  (event) => {

		// construct the body based on the single input or button that was clicked
		const body = new URLSearchParams();

		body.append(node.name, node.value);

		// append the csrf token
		body.append('_csrf', form.querySelector('input[name="_csrf"]').value)

		fetch(withAjax(window.location.href), { method: "post", body }).then(handleAjaxSaveResponse);

		// set the class="selected" of the button that was clicked
		node.parentNode.querySelectorAll('button').forEach(function(button){
			button.classList.remove('selected');
		});

		node.classList.add('selected');

		event.preventDefault();
		return false;
		})
	})
  })