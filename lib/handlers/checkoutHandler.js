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
  console.log(process.env.STRIPE_TEST_KEY);
  return {
    method: 'POST',
    hostname: 'api.stripe.com',
    path: '/v1/charges',
    headers: {
      Authorization: `Basic ${formatAPIKey(process.env.STRIPE_TEST_KEY)}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
  };
}

async function stripeRequest(dataToWrite) {
  console.log({ dataToWrite });

  return new Promise((resolve, reject) => {
    const stripeReq = https.request(reqOptionsStripe(), res => {
      const chunks = [];

      res.on('data', chunk => chunks.push(chunk));

      res.on('end', () => {
        const body = JSON.parse(Buffer.concat(chunks).toString());
        console.log(body);

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

function reqOptionsMailgun() {
  const { MAILGUN_API_KEY, MAILGUN_DOMAIN_NAME } = process.env;
  return {
    method: 'POST',
    hostname: 'api.mailgun.net',
    path: `/v3/${MAILGUN_DOMAIN_NAME}/messages`,
    headers: {
      Authorization: `Basic ${MAILGUN_API_KEY}`,
    },
    auth: `pass:${MAILGUN_API_KEY}`,
  };
}

async function mailgunRequest(formData) {
  debugger;
  const message = `Thank you for your patronage, you bought ${JSON.stringify(
    formData.order,
    null,
    2
  )}.
  Your total was ${formData.order.totalPrice}`;

  const postData = `------WebKitFormBoundary7MA4YWxkTrZu0gW\r\nContent-Disposition: form-data; name="from"\r\n\r\nPayment receipt <OlaPizza@sandbox5fa744e4787c414cbb2da34d85fc6a58.mailgun.org>\r\n------WebKitFormBoundary7MA4YWxkTrZu0gW\r\nContent-Disposition: form-data; name="to"\r\n\r\n${formData.email}\r\n------WebKitFormBoundary7MA4YWxkTrZu0gW\r\nContent-Disposition: form-data; name="subject"\r\n\r\n${formData.name}, your payment ${formData.status}\r\n------WebKitFormBoundary7MA4YWxkTrZu0gW\r\nContent-Disposition: form-data; name="text"\r\n\r\n${message}\r\n------WebKitFormBoundary7MA4YWxkTrZu0gW--`;

  return new Promise((resolve, reject) => {
    const emailReq = https.request(reqOptionsMailgun(), res => {
      console.log(res);
      if (res.statusCode === 200) {
        resolve(helpers.generateResponseObj(200, `Receipt sent. ${res.statusMessage}`));
      } else {
        reject(helpers.errorWrapper(res.statusMessage, 500));
      }
    });

    emailReq.on('error', err => {
      reject(helpers.errorWrapper(`There was an error sending receipt email: ${err}`, 500));
    });

    emailReq.setHeader(
      'content-type',
      'multipart/form-data; boundary=----WebKitFormBoundary7MA4YWxkTrZu0gW'
    );
    emailReq.write(postData);
    emailReq.end();
  });
}

async function checkout(data, email) {
  debugger;
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
  console.log(reqBodyObj);
  const orderDelReqObj = {
    payload: { clearAll: true },
  };

  const responseArray = await Promise.all([
    stripeRequest(queryString.stringify(reqBodyObj)),
    _order.delete(currentUserData.email, orderDelReqObj),
  ]);

  if (JSON.stringify(responseArray).search(/error/i) > -1) {
    console.log(responseArray);
    throw helpers.errorWrapper('An error occurred making the payment. Please try again later', 500);
  }

  const { status: paymentStatus } = responseArray[0];

  const emailContents = {
    order: cart,
    email: currentUserData.email,
    name: currentUserData.name,
    status: paymentStatus,
  };

  const emailResponse = await mailgunRequest(emailContents);
  if (emailResponse?.error || emailResponse.statusCode !== 200) throw emailResponse.error;

  return helpers.generateResponseObj(200, `Your payment ${paymentStatus}! Hope to see you soon`);
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
      // Send email with mailgun
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
