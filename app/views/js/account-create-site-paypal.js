const paypalButtonContainer = document.getElementById('paypal-button-container');
const createSitePaypalContainer = document.getElementById('create-site-paypal');
const form = document.querySelector('form');

if (paypalButtonContainer && createSitePaypalContainer && form && window.paypal && window.paypal.Buttons) {
  const subscriptionId = createSitePaypalContainer.dataset.paypalSubscriptionId;
  const planId = createSitePaypalContainer.dataset.paypalPlanId;
  const newQuantity = createSitePaypalContainer.dataset.paypalNewQuantity;
  const redirectUrl = createSitePaypalContainer.dataset.paypalRedirectUrl;

  if (subscriptionId && planId && newQuantity && redirectUrl) {
    window.paypal
      .Buttons({
        createSubscription: function (data, actions) {
          return actions.subscription.revise(subscriptionId, {
            plan_id: planId,
            quantity: newQuantity,
          });
        },
        onApprove: function () {
          form.innerHTML = '<p>Loading...</p>';
          window.location.href = redirectUrl;
        },
      })
      .render('#paypal-button-container');
  }
}
