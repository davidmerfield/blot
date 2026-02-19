var paymentForm = document.getElementById('payment-form');
var cardRadio = document.getElementById('card-radio');
var paypalRadio = document.getElementById('paypal-radio');
var paypalButtonContainer = document.getElementById('paypal-button-container');
var cardMethod = document.getElementById('card_method');
var paypalMethod = document.getElementById('paypal_method');

if (
  paymentForm &&
  cardRadio &&
  paypalRadio &&
  paypalButtonContainer &&
  cardMethod &&
  paypalMethod
) {
  function updatePaymentMethodVisibility() {
    var isCardSelected = cardRadio.checked;
    cardMethod.style.display = isCardSelected ? 'block' : 'none';
    paypalMethod.style.display = isCardSelected ? 'none' : 'block';
  }

  updatePaymentMethodVisibility();

  cardRadio.addEventListener('change', updatePaymentMethodVisibility);
  paypalRadio.addEventListener('change', updatePaymentMethodVisibility);
}
