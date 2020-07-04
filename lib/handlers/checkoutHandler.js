// File handles checkout process

// Dependencies
const https = require('https');
const auth = require('../auth');
const _data = require('../data');
const helpers = require('../helpers');
const queryString = require('querystring');

const acceptableCards = ['tok_mastercard', 'tok_visa'];

const private = {
  formatAPIKey(apiKey) {
    return Buffer.from(apiKey).toString('base64');
  },
  reqOptions() {
    return {
      method: 'POST',
      hostname: 'api.stripe.com',
      path: '/v1/charges',
      headers: {
        Authorization: `Basic ${this.formatAPIKey(process.env.STRIPE_TEST_KEY)}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    };
  },
};

// TODO Refactor
async function checkout(data, email) {
  const { payload } = data;

  const cardBrand =
    helpers.validateType(payload?.cardBrand, 'string') &&
    acceptableCards.includes(payload.cardBrand)
      ? payload.cardBrand
      : false;

  const currency =
    helpers.validateType(payload?.currency, 'string') && ['usd', 'gdp'].includes(payload.currency)
      ? payload.currency
      : false;

  if (!cardBrand) throw 'Missing or invalid cardBrand field';
  if (!currency) throw 'Missing or invalid currency field';

  const { type, data: currentUserData } = await _data.read('users', email);
  if (type === 'error') throw [currentUserData];

  const cart = currentUserData?.cart;

  if (!cart || parseInt(cart.orderCount) === 0) throw 'Your cart is empty';

  // TODO Check why metaData isn't working
  const reqBodyObj = {
    amount: Math.round(helpers.convertDollarToFloat(cart.totalPrice)),
    currency,
    source: cardBrand,
    description: `Payment for ${JSON.stringify(cart)}`,
    // metadata: {
    //   customerName: currentUserData.name,
    //   customerEmail: currentUserData.email,
    //   customerStreetAddress: currentUserData.streetAddress,
    // },
    'metadata[customer_name]': currentUserData.name,
    'metadata[customer_email]': currentUserData.email,
    'metadata[customer_address]': currentUserData.streetAddress,
  };

  const chunks = [];
  const reqToStripe = https.request(private.reqOptions(), res => {
    res.on('error', err => console.log(err));

    res.on('data', chunk => chunks.push(chunk));

    res.on('end', () => {
      const body = Buffer.concat(chunks).toString();
      console.log(`Your Payment ${JSON.parse(body).status}`);
    });
  });

  reqToStripe.on('error', err => console.log(err));

  reqToStripe.write(queryString.stringify(reqBodyObj));
  reqToStripe.end();
}

const checkoutHandler = {
  async checkout(data) {
    const { method, headers, queryStringObject } = data;

    const resultObj = helpers.checkForRequiredField(queryStringObject, ['email']);
    if (resultObj?.statusCode) return resultObj;

    const result = await auth.verifyToken(headers, resultObj.email);
    if (result.type === 'error' || !result.isValid) {
      return helpers.generateResponseObj(401, result?.error ?? 'Invalid token');
    }

    try {
      if (method !== 'post') {
        return helpers.generateResponseObj(405, 'Method is not allowed for this route');
      }

      await checkout(data, resultObj.email);
      // Send email with mailgun

      return helpers.generateResponseObj(200, 'Payment has been sent for processing');
    } catch (error) {
      let errorMsg = error;
      let statusCode = 500;

      if (helpers.validateType(error, 'array')) (errorMsg = error[0]), (statusCode = 400);

      console.error(`${errorMsg} \n`);
      return helpers.generateResponseObj(statusCode, errorMsg);
    }
  },
};

module.exports = Object.freeze(checkoutHandler);
