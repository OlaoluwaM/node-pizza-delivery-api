// File handles checkout process

// Dependencies
const https = require('https');
const auth = require('../auth');
const _data = require('../data');
const helpers = require('../helpers');
const queryString = require('querystring');
const { _order } = require('./orderHandler');
const CustomError = require('../custom-error');

const acceptableCards = ['tok_mastercard', 'tok_visa'];

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
      const errMsg = `An error occurred while making payment. ${err}`;
      reject(helpers.errorWrapper(errMsg, 500));
    });

    stripeReq.write(dataToWrite);
    stripeReq.end();
  });
}

// function reqOptionsEmail() {
//   const { SENDGRID_TEST_KEY } = process.env;
//   return {
//     method: 'POST',
//     hostname: 'api.sendgrid.com',
//     path: '/v3/mail/send',
//     headers: {
//       Authorization: `Bearer ${SENDGRID_TEST_KEY.replace(/\r?\n|\r/g, '')}`,
//       'Content-Type': 'application/json',
//     },
//   };
// }

// async function sendEmailRequest(customerInfo) {
//   const { type, data: emailContents } = await _data.read('', 'email-template');
//   if (type === 'error') throw emailContents;

//   const postData = JSON.stringify(emailContents).replace(/DATA\d{1,1}/g, match => {
//     const index = parseInt(match.slice(4));
//     return customerInfo[index];
//   });

//   return new Promise((resolve, reject) => {
//     const emailReq = https.request(reqOptionsEmail(), res => {
//       if (res.statusCode === 200) {
//         console.log(`Receipt sent. ${res.statusMessage}`);
//         resolve(helpers.generateResponseObj(200, `Email receipt sent successfully`));
//       } else {
//         reject(helpers.errorWrapper(res.statusMessage, 500));
//       }
//     });

//     emailReq.on('error', err => {
//       reject(helpers.errorWrapper(`There was an error sending receipt email: ${err}`, 500));
//     });

//     emailReq.write(postData);
//     emailReq.end();
//   });
// }

async function checkout(data, email) {
  const { payload } = data;

  // TODO
  //! Stripe's amount should be in cents
  // !Payload should include user's order and total in cents
  // !Check if total coming from the client and total on server are equal, if not prioritize total from client

  const { data: currentUserData } = await _data.read('users', email);

  const cart = currentUserData?.cart;
  if (!cart || parseInt(cart.orderCount) === 0) throw 'Your cart is empty';

  const reqBodyObj = {
    amount,
    currency: 'usd',
    receipt_email: currentUserData.email,
    description: `Payment for ${JSON.stringify(cart)}`,
    'metadata[customer_name]': currentUserData.name,
    'metadata[customer_email]': currentUserData.email,
    'metadata[customer_address]': currentUserData.streetAddress,
  };

  let responseArray;

  try {
    responseArray = await Promise.all([
      await stripeRequest(queryString.stringify(reqBodyObj)),
      await _order.delete(currentUserData.email),
    ]);
  } catch (error) {
    throw new CustomError(error);
  }

  const { status: paymentStatus } = responseArray[0];
  console.log(paymentStatus);

  // TODO convert from sendGrid to fapiMail

  return helpers.generateResponseObj(
    202,
    `Your payment was successful and receipt emailed! Hope to see again you soon`
  );
}

const checkoutHandler = {
  async checkout(data) {
    const { method, headers, queryStringObject } = data;

    try {
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
