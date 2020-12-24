// File handles checkout process

// Dependencies
const auth = require('../auth');
const _data = require('../data');
const stripe = require('stripe')(process.env.STRIPE_TEST_KEY);
const helpers = require('../helpers');
const CustomError = require('../custom-error');

const postmark = require('postmark');
const postmarkClient = new postmark.Client('POSTMARK_API_TEST');

const {
  orderHandler: { _order },
} = require('./orderHandler');

function getCartTotal(cartArray) {
  let cartTotalAsFloat = cartArray.reduce((totalCost, { 1: cartItem }) => {
    if (!helpers.validateType(cartItem, 'object')) return totalCost;
    const { total } = cartItem;
    return (totalCost += total);
  }, 0);

  return helpers.formatCurrencyForStripe(cartTotalAsFloat);
}

function convertCartToHTMLList(cartData) {
  const cartItemsAsListItems = cartData.map(orderItem => {
    if (!helpers.validateType(orderItem[1], 'object')) return;

    const {
      0: orderName,
      1: { quantity, totalPrice },
    } = orderItem;

    return `<li>${orderName}: (x${quantity}) ${totalPrice}</li>`;
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

    const paymentIntent = await stripe.paymentIntents.create({
      amount: getCartTotal(Object.entries(cart)),
      currency: 'usd',
      payment_method_types: ['card'],
      metadata: { integration_check: 'accept_a_payment' },
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

    const { client_secret: clientSecret, amount } = await retrievePaymentIntent(cart);
    return helpers.generateResponseObj(200, { clientSecret, currentAmount: amount });
  },

  async put(userInfo, payload) {
    const updatedPayloadIntentData = helpers.validateType(
      helpers.normalize(payload?.updatedPaymentIntentData),
      'object'
    )
      ? payload.updatedPaymentIntentData
      : false;

    if (!updatedPayloadIntentData) throw new CustomError('No payment intent data to update', 400);

    if (updatedPayloadIntentData?.amount) {
      const totalFromClient = helpers.formatCurrencyForStripe(updatedPayloadIntentData.amount);
      const totalOnServer = helpers.formatCurrencyForStripe(userInfo.cart.totalPrice);

      updatedPayloadIntentData.amount =
        totalFromClient === totalOnServer ? totalFromClient : totalOnServer;
    }

    const { id } = await retrievePaymentIntent(userInfo.cart);
    const { client_secret: clientSecret } = await stripe.paymentIntents.update(
      id,
      updatedPayloadIntentData
    );

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

  async sendInvoice(userInfo) {
    const { cart, email } = userInfo;

    const emailJSONTemplate = {
      From: 'midas@pizza.com',
      to: email,
      Subject: 'Thank you eating with Midas!',
      HtmlBody: `<h1>Here's your invoice</h1>
    ${convertCartToHTMLList(Object.entries(cart))}
    <p>You ordered a total of ${cart.orderCount}</p>
    <p>Your total was ${Intl.NumberFormat({ style: 'currency', currency: 'usd' }).format(
      getCartTotal(Object.entries(cart))
    )}</p>`,
    };

    let invoiceEmailResponse;

    try {
      invoiceEmailResponse = await Promise.all([
        await postmarkClient.sendEmail(emailJSONTemplate),
        await _order.delete(email),
      ]);
    } catch (error) {
      console.error(error);
      throw new CustomError('An error occurred sending the invoice', 500);
    }

    return helpers.generateResponseObj(200, {
      ...invoiceEmailResponse[0],
      customMessage: 'Invoice sent',
    });
  },
};

const checkoutHandler = {
  async checkout(data) {
    const { method, headers, queryStringObject, trimmedPath } = data;

    let newAccessToken = null;
    try {
      const resultObj = helpers.checkForRequiredField(queryStringObject, ['email']);

      const { data: currentUserData } = await _data.read('users', resultObj.email);

      const authenticationResult = await auth.verifyToken(headers, resultObj.email);
      if (authenticationResult?.newToken) newAccessToken = authenticationResult.newToken;

      if (!currentUserData?.cart || currentUserData?.cart?.orderCount === 0) {
        return helpers.generateResponseObj(200, {
          token: newAccessToken,
          message: 'Cart is empty',
        });
      }

      if (method !== 'post' && !currentUserData?.cart?.stripeMetaData?.paymentIntentId) {
        throw new CustomError("No payment intent associated with user's cart", 400);
      }

      let response;

      if (trimmedPath.search(/\/sendInvoice*/) === -1) {
        response = await checkoutHandler['_paymentIntentMethods'][method](
          currentUserData,
          data?.payload
        );
      } else {
        if (method !== 'post') throw new CustomError('Method not allowed', 405);
        response = await checkoutHandler['_paymentIntentMethods']['sendInvoice'](currentUserData);
      }

      return { ...response, token: newAccessToken };
    } catch (error) {
      return helpers.handleApiError(error, newAccessToken);
    }
  },

  _paymentIntentMethods: Object.freeze(paymentIntentMethods),
};

module.exports = Object.freeze(checkoutHandler);
