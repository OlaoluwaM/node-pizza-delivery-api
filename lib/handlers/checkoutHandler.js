// File handles checkout process

// Dependencies
const https = require('https');
const auth = require('../auth');
const _data = require('../data');
const helpers = require('../helpers');
const queryString = require('querystring');
const { _order } = require('./orderHandler');

const acceptableCards = ['tok_mastercard', 'tok_visa'];

function formatAPIKey(apiKey) {
  return Buffer.from(apiKey).toString('base64');
}

function reqOptionsStripe() {
  const { STRIPE_TEST_KEY } = process.env;
  return {
    method: 'POST',
    hostname: 'api.stripe.com',
    path: '/v1/charges',
    headers: {
      Authorization: `Basic ${formatAPIKey(STRIPE_TEST_KEY)}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
  };
}

async function stripeRequest(dataToWrite) {
  return new Promise((resolve, reject) => {
    const stripeReq = https.request(reqOptionsStripe(), res => {
      const chunks = [];

      res.on('data', chunk => chunks.push(chunk));

      res.on('end', () => {
        const body = JSON.parse(Buffer.concat(chunks).toString());

        if (body.error) {
          reject(helpers.errorWrapper(body.error.code, 500));
        } else {
          resolve({ body, status: body.status });
        }
      });
    });

    stripeReq.on('err', err => {
      const errMsg = `An error occurred while making payment. ${err}`;
      reject(helpers.errorWrapper(errMsg, 500));
    });

    stripeReq.write(dataToWrite);
    stripeReq.end();
  });
}

function reqOptionsEmail() {
  const { SENDGRID_TEST_KEY } = process.env;
  return {
    method: 'POST',
    hostname: 'api.sendgrid.com',
    path: '/v3/mail/send',
    headers: {
      Authorization: `Bearer ${SENDGRID_TEST_KEY.replace(/\r?\n|\r/g, '')}`,
      'Content-Type': 'application/json',
    },
  };
}

async function sendEmailRequest(customerInfo) {
  const { type, data: emailContents } = await _data.read('', 'email-template');
  if (type === 'error') throw emailContents;

  const postData = JSON.stringify(emailContents).replace(/DATA\d{1,1}/g, match => {
    const index = parseInt(match.slice(4));
    return customerInfo[index];
  });

  return new Promise((resolve, reject) => {
    const emailReq = https.request(reqOptionsEmail(), res => {
      if (res.statusCode === 200) {
        console.log(`Receipt sent. ${res.statusMessage}`);
        resolve(helpers.generateResponseObj(200, `Email receipt sent successfully`));
      } else {
        reject(helpers.errorWrapper(res.statusMessage, 500));
      }
    });

    emailReq.on('error', err => {
      reject(helpers.errorWrapper(`There was an error sending receipt email: ${err}`, 500));
    });

    emailReq.write(postData);
    emailReq.end();
  });
}

async function checkout(data, email) {
  const { payload } = data;

  const card =
    helpers.validateType(payload?.card, 'string') && acceptableCards.includes(payload.card)
      ? payload.card
      : false;

  const currency =
    helpers.validateType(payload?.currency, 'string') && ['usd', 'gdp'].includes(payload.currency)
      ? payload.currency
      : false;

  if (!card) throw 'Missing or invalid card field';
  if (!currency) throw 'Missing or invalid currency field';

  const { type, data: currentUserData } = await _data.read('users', email);
  if (type === 'error') throw helpers.errorWrapper(currentUserData, 500);

  const cart = currentUserData?.cart;

  if (!cart || parseInt(cart.orderCount) === 0) throw 'Your cart is empty';

  const reqBodyObj = {
    amount: Math.round(helpers.convertDollarToFloat(cart.totalPrice, true)),
    currency,
    source: card,
    description: `Payment for ${JSON.stringify(cart)}`,
    'metadata[customer_name]': currentUserData.name,
    'metadata[customer_email]': currentUserData.email,
    'metadata[customer_address]': currentUserData.streetAddress,
  };

  const orderDelReqObj = {
    payload: { clearAll: true },
  };

  const responseArray = await Promise.all([
    stripeRequest(queryString.stringify(reqBodyObj)),
    _order.delete(currentUserData.email, orderDelReqObj),
  ]);

  if (JSON.stringify(responseArray).search(/error/i) > -1) {
    throw helpers.errorWrapper('An error occurred making the payment. Please try again later', 500);
  }

  const { MY_SENDER_EMAIL } = process.env;
  const { status: paymentStatus } = responseArray[0];

  const subject = `Your payment ${paymentStatus} ${currentUserData.name}! Thank your for your patronage`;
  const message = `This is a receipt for your order. Your total was ${cart.totalPrice}. It will arrive in 30 minutes.`;

  const emailData = [currentUserData.email, MY_SENDER_EMAIL, subject, message];

  const emailResponse = await sendEmailRequest(emailData);
  if (emailResponse?.error || emailResponse.statusCode !== 200) throw emailResponse.error;

  return helpers.generateResponseObj(
    200,
    `Your payment ${paymentStatus} and receipt emailed! Hope to see again you soon`
  );
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

      const response = await checkout(data, resultObj.email);
      return response;
    } catch (error) {
      let errorMsg = error;
      let statusCode = 400;

      if (helpers.validateType(error, 'object') && error?.statusCode) {
        (errorMsg = error.error), (statusCode = error.statusCode);
      }

      console.error(`${errorMsg} \n`);
      return helpers.generateResponseObj(statusCode, errorMsg);
    }
  },
};

module.exports = Object.freeze(checkoutHandler);
