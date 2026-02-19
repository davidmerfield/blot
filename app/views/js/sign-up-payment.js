var paymentForm = document.getElementById('payment-form');
var cardRadio = document.getElementById('card-radio');
var paypalRadio = document.getElementById('paypal-radio');
var paypalButtonContainer = document.getElementById('paypal-button-container');

if (paymentForm && cardRadio && paypalRadio && paypalButtonContainer) {
  var submitInput = paymentForm.querySelector('input[type="submit"]');

  if (window.paypal && window.paypal.Buttons) {
    var paypalPlan = paypalButtonContainer.dataset.paypalPlan;
    var paypalRedirectUrl = paypalButtonContainer.dataset.paypalRedirectUrl;

    if (paypalPlan && paypalRedirectUrl) {
      window.paypal
        .Buttons({
          createSubscription: function (data, actions) {
            return actions.subscription.create({
              plan_id: paypalPlan
            });
          },
          onApprove: function (data) {
            paymentForm.innerHTML = '<p>Loading your payment...</p>';
            window.location.href = paypalRedirectUrl + data.subscriptionID;
          }
        })
        .render('#paypal-button-container');
    }
  }

  if (window.Stripe) {
    var stripeKey = paymentForm.dataset.stripeKey;
    var cardContainer = document.getElementById('card');

    if (stripeKey && cardContainer) {
      var stripe = Stripe(stripeKey);
      var elements = stripe.elements();

      var style = {
        base: {
          fontSize: '16px',
          color: '#000',
          iconColor: '#909bb0',
          '::placeholder': {
            color: '#909bb0'
          }
        }
      };

      var card = elements.create('card', { style: style });
      card.mount('#card');

      function setFocusColor(elementId) {
        var element = document.getElementById(elementId);
        var label = document.querySelector('label[for="' + elementId + '"]');

        if (element) {
          element.style.borderColor = 'var(--accent-color)';
        }

        if (label) {
          label.style.color = 'var(--accent-color)';
        }
      }

      function resetFocusColor(elementId) {
        var element = document.getElementById(elementId);
        var label = document.querySelector('label[for="' + elementId + '"]');

        if (element) {
          element.style.borderColor = 'var(--border-color)';
        }

        if (label) {
          label.style.color = '';
        }
      }

      function renderError(message) {
        var errorElement = document.getElementById('error');

        if (!errorElement) {
          return;
        }

        errorElement.textContent = message;
        errorElement.style.display = 'block';

        if (submitInput) {
          submitInput.classList.remove('working');
        }
      }

      card.on('focus', function () {
        var errorElement = document.getElementById('error');

        if (errorElement) {
          errorElement.style.display = 'none';
        }

        if (submitInput) {
          submitInput.classList.remove('working');
        }

        setFocusColor(card._parent.id);
      });

      card.on('blur', function () {
        resetFocusColor(card._parent.id);
      });

      paymentForm.addEventListener('submit', function (event) {
        if (!cardRadio.checked) {
          return;
        }

        if (submitInput) {
          submitInput.classList.add('working');
        }

        event.preventDefault();

        var emailInput = paymentForm.querySelector('.email');

        if (emailInput && !emailInput.checkValidity()) {
          renderError('Please enter a valid email address');
          return;
        }

        stripe.createToken(card).then(function (result) {
          if (result.error) {
            renderError(result.error.message);
            return;
          }

          var hiddenInput = paymentForm.querySelector('input.stripeToken');

          if (hiddenInput) {
            hiddenInput.setAttribute('value', result.token.id);
            paymentForm.submit();
          }
        });
      });
    }
  }
}
