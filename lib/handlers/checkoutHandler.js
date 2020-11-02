// File handles checkout process

// Dependencies
const https = require('https');
const auth = require('../auth');
const _data = require('../data');
const helpers = require('../helpers');
const queryString = require('querystring');
const {
  orderHandler: { _order },
  verifyOrderPayload,
} = require('./orderHandler');
const CustomError = require('../custom-error');

function getTotalOrderCount(cart) {
  return cart.reduce((total, { 1: { quantity } }) => (total += quantity), 0);
}

function getCartTotal(cart) {
  return cart.reduce(
    (total, { 1: { quantity, initialPrice } }) => (total += quantity * initialPrice),
    0
  );
}

function formatAPIKey(apiKey) {
  return Buffer.from(apiKey).toString('base64');
}

function reqOptionsStripe() {
  const { STRIPE_TEST_KEY } = process.env;
  return {
    method: 'POST',
    hostname: 'api.stripe.com',
    path: '/v1/payment_intents',
    headers: {
      Authorization: `Basic ${formatAPIKey(STRIPE_TEST_KEY).replace('=', '6')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
  };
}

function reqOptionsEmail() {
  return {
    method: 'POST',
    hostname: 'api.postmarkapp.com',
    path: '/email',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'X-Postmark-Server-Token': 'POSTMARK_API_TEST',
    },
  };
}

async function sendInvoice(invoiceData) {
  return new Promise((resolve, reject) => {
    const emailRequest = https.request(reqOptionsEmail(), res => {
      const chunks = [];

      res.on('data', chunk => chunks.push(chunk));
      res.on(
        'error',
        err =>
          new CustomError(
            `Error occurred trying to send invoice, please try again later: ${err}`,
            500
          )
      );

      res.on('end', () => {
        const body = JSON.parse(Buffer.concat(chunks).toString());
        console.log(body);
        if (body.error) {
          reject(helpers.errorWrapper(body.error, 500));
        } else {
          resolve({ body, status: body.status });
        }
      });
    });

    emailRequest.on('error', err => {
      reject(helpers.errorWrapper(`An error occurred, invoice was not sent. ${err}`, 500));
    });

    emailRequest.write(invoiceData);
    emailRequest.end();
  });
}

async function stripeRequest(dataToWrite) {
  return new Promise((resolve, reject) => {
    const stripeReq = https.request(reqOptionsStripe(), res => {
      const chunks = [];

      res.on('data', chunk => chunks.push(chunk));

      res.on('error', err =>
        reject(
          new CustomError(
            `Error, reading response from stripe, please try again later: ${err}`,
            500
          )
        )
      );

      res.on('end', () => {
        const body = JSON.parse(Buffer.concat(chunks).toString());
        console.log(body);
        if (body.error) {
          reject(helpers.errorWrapper(body.error, 500));
        } else {
          resolve({ body, status: body.status });
        }
      });
    });

    stripeReq.on('error', err => {
      reject(helpers.errorWrapper(`An error occurred while making payment. ${err}`, 500));
    });

    stripeReq.write(dataToWrite);
    stripeReq.end();
  });
}

function convertCartToHTMLList(cartData) {
  const cartItemsAsListItems = cartData.map(orderItem => {
    if (helpers.validateType(orderItem[1], 'number')) return;
    const {
      0: orderName,
      1: { quantity, initialPrice },
    } = orderItem;
    return `<li>${orderName}: (x${quantity}) ${quantity * initialPrice}</li>`;
  });

  return `<ul>${cartItemsAsListItems.join('')}</ul>`;
}

async function checkout(data, email) {
  const { payload } = data;

  const cart = verifyOrderPayload(payload?.orders);

  const totalAmount = getCartTotal(cart);
  const orderCount = getTotalOrderCount(cart);

  const { data: currentUserData } = await _data.read('users', email);

  const reqBodyObj = {
    amount: parseFloat(totalAmount.toFixed(2)) * 100,
    currency: 'usd',
    receipt_email: currentUserData.email,
    description: `Payment for ${JSON.stringify(Object.fromEntries(cart))}`,
    'metadata[customer_name]': currentUserData.name,
    'metadata[customer_email]': email,
    'metadata[customer_address]': currentUserData.streetAddress,
  };

  try {
    await Promise.all([
      await stripeRequest(queryString.stringify(reqBodyObj)),
      await _order.delete(email),
    ]);
  } catch (error) {
    throw new CustomError(error);
  }

  const emailJSONTemplate = {
    From: 'midas@pizza.com',
    to: email,
    Subject: 'Thank you eating with Midas!',
    HtmlBody: `<h1>Here's your invoice</h1>
    ${convertCartToHTMLList(cart)}
    <p>You ordered a total of ${orderCount}</p>
    <p>Your total was ${totalAmount}</p>`,
  };

  try {
    await sendInvoice(JSON.stringify(emailJSONTemplate));
  } catch (error) {
    throw new CustomError(error);
  }

  return helpers.generateResponseObj(
    202,
    `Your payment was successful and receipt emailed! Hope to see again you soon`
  );
}

const checkoutHandler = {
  async checkout(data) {
    const { method, headers, queryStringObject } = data;

    try {
      if (!data?.payload) throw new CustomError('No data was sent to complete request', 400);

      const resultObj = helpers.checkForRequiredField(queryStringObject, ['email']);

      const authenticationResult = await auth.verifyToken(headers, resultObj.email);

      data.headers = { ...headers, token: authenticationResult?.newToken?.Id || headers.token };

      if (method !== 'post') throw new CustomError('Method is not allowed for this route', 405);

      const response = await checkout(data, resultObj.email);
      if (authenticationResult?.newToken) response.token = authenticationResult.newToken;

      return response;
    } catch (error) {
      if (error instanceof CustomError) {
        const { message, statusCode } = error;
        console.log(`${message} \n`);
        return helpers.generateResponseObj(statusCode, message);
      }
    }
  },
};

module.exports = Object.freeze(checkoutHandler);
