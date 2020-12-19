// File handles checkout process

// Dependencies
const https = require('https');
const auth = require('../auth');
const _data = require('../data');
const stripe = require('stripe')(process.env.STRIPE_TEST_KEY);
const helpers = require('../helpers');
const CustomError = require('../custom-error');

const {
  orderHandler: { _order },
  verifyOrderPayload,
} = require('./orderHandler');


function getTotalOrderCount(cart) {
  return cart.reduce((total, { 1: { quantity } }) => (total += quantity), 0);
}

function getCartTotal(cart) {
  let totalFloat = cart.reduce(
    (total, { 1: { quantity, initialPrice } }) => (total += quantity * initialPrice),
    0
  );
  totalFloat *= 100;
  return parseFloat(totalFloat.toFixed(2));
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

async function retrievePaymentIntent(paymentIntentId) {
  if (helpers.validateType(paymentIntentId, 'object')) {
    // Assume it is the cart object
    paymentIntentId = paymentIntentId.stripeMetaData.paymentIntentId;
  }
  return await stripe.paymentIntents.retrieve(paymentIntentId);
}

const paymentIntentMethods = {
  async post(userInfo) {
    const { cart, email } = userInfo;

    const totalPriceAsWholeNumber = cart.totalPrice * 100;
    const stripeFormattedTotal = parseFloat(totalPriceAsWholeNumber.toFixed(2));

    const paymentIntent = await stripe.paymentIntents.create({
      amount: stripeFormattedTotal,
      currency: 'usd',
    });

    cart.stripeMetaData = {
      paymentIntentId: paymentIntent.id,
    };

    try {
      await _data.update('users', email, { ...userInfo, cart });
    } catch (error) {
      await stripe.paymentIntents.cancel(paymentIntent.id);
      throw new CustomError('An error occurred updating user cart with payment intent', 500);
    }

    return helpers.generateResponseObj(201, {
      message: 'Payment Intent created',
      clientSecret: paymentIntent.client_secret,
    });
  },

  async get(userInfo) {
    const { cart } = userInfo;

    const { client_secret: clientSecret } = await retrievePaymentIntent(cart);
    return helpers.generateResponseObj(200, { clientSecret });
  },

  async put(userInfo, payload) {
    const { updatedData } = payload;

    const { id } = await retrievePaymentIntent(userInfo.cart);
    const { client_secret: clientSecret } = await stripe.paymentIntents.update(id, updatedData);

    return helpers.generateResponseObj(201, {
      message: 'Payment Intent updated',
      clientSecret,
    });
  },

  async delete(userInfo) {
    const { id } = await retrievePaymentIntent(userInfo.cart);

    try {
      await Promise.all([
        await (async () => {
          await stripe.paymentIntents.cancel(id);
          delete userInfo.cart.stripeMetaData;
        })(),

        await _data.update('users', userInfo.email, userInfo),
      ]);
    } catch (error) {
      console.error(error);
      throw new CustomError('Something went wrong deleting this payment intent', 500);
    }

    return helpers.generateResponseObj(200, { message: 'Payment Intent deleted' });
  },
};

async function checkout(data, email) {
  const { payload } = data;

  const cart = verifyOrderPayload(payload?.orders);

  const totalAmount = getCartTotal(cart);
  const orderCount = getTotalOrderCount(cart);

  // const { data: currentUserData } = await _data.read('users', email);

  // const reqBodyObj = {
  //   currency: 'usd',
  //   receipt_email: currentUserData.email,
  //   description: `Payment for ${JSON.stringify(Object.fromEntries(cart))}`,
  //   'metadata[customer_name]': currentUserData.name,
  //   'metadata[customer_email]': email,
  //   'metadata[customer_address]': currentUserData.streetAddress,
  // };

  let promiseResult;
  try {
    promiseResult = await Promise.all([
      await stripePayment(parseFloat(totalAmount.toFixed(2))),
      await _order.delete(email),
    ]);
  } catch (error) {
    throw new CustomError(error);
  }

  const [clientSecretObject] = promiseResult;

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

  return helpers.generateResponseObj(202, {
    message: `Your payment was successful and receipt emailed! Hope to see again you soon`,
    ...clientSecretObject,
  });
}

const checkoutHandler = {
  async paymentIntent(data) {
    const { method, headers, queryStringObject } = data;

    try {
      const resultObj = helpers.checkForRequiredField(queryStringObject, ['email']);

      const { data: currentUserData } = await _data.read('users', resultObj.email);

      if (!helpers.normalize(currentUserData?.cart)) {
        return helpers.generateResponseObj(200, 'Cart is empty');
      }

      if (method !== 'post' && !currentUserData?.cart?.stripeMetaData?.paymentIntentId) {
        throw new CustomError('No payment intent associated with this user', 400);
      }

      const authenticationResult = await auth.verifyToken(headers, resultObj.email);

      data.headers = { ...headers, token: authenticationResult?.newToken?.Id || headers.token };

      let response = await checkoutHandler['_paymentIntentMethods'][method](
        currentUserData,
        data?.payload
      );

      if (authenticationResult?.newToken) response.token = authenticationResult.newToken;

      return response;
    } catch (error) {
      if (error instanceof CustomError) {
        const { message, statusCode } = error;
        console.log(`${message} \n`);
        return helpers.generateResponseObj(statusCode, message);
      }

      console.error(error);
      return helpers.generateResponseObj(500, error);
    }
  },

  async sentReceipt() {},

  _paymentIntentMethods: Object.freeze(paymentIntentMethods),
};

module.exports = Object.freeze(checkoutHandler);
