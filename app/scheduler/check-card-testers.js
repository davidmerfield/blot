// Iterate over Stripe customers and check if they have created a blog or nor
// Return Stripe customers without a corresponding Blot user so the scheduler
// can notify the administrator for investigation.
const User = require('models/user');
const config = require("config");
const stripe = require("stripe")(config.stripe.secret);

const getByCustomerId = async (customerId) => {
    return new Promise((resolve, reject) => {
        User.getByCustomerId(customerId, (err, user) => {
            resolve(user);
        });
    });
};

module.exports = async function (startingAfter = null) {
    
    const suspectedUsers = [];

    const parameters = startingAfter ? { limit: 100, starting_after: startingAfter } : { limit: 100 };
    const response = await stripe.customers.list(parameters);

    for (const customer of response.data) {

        // if the customer was created more than 7 days ago, finish the script
        const created = new Date(customer.created * 1000);
        const now = new Date();
        const diff = now - created;
        const days = diff / (1000 * 60 * 60 * 24);

        if (days > 7) {
            return suspectedUsers
        }

        const user = await getByCustomerId(customer.id);
    
        if (!user) {
            suspectedUsers.push(customer);
         }
    }

    if (!response.has_more) {
        return suspectedUsers;
    }

    return module.exports(response.data[response.data.length - 1].id);
}

if (require.main === module) {
    module.exports().then((suspectedUsers) => {
        suspectedUsers.forEach((user) => {
            console.log(`No user found for customer ${user.id} with email ${user.email}`);
            console.log(`https://dashboard.stripe.com/customers/${user.id}`);
            console.log('node scripts/user/refund-and-delete.js', user.id);
        });
    });
}
