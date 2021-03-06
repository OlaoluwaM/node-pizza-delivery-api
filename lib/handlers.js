// File that handles requests to server

// Dependencies
const helpers = require('./helpers');
const userHandlers = require('./handlers/userHandlers');
const tokensHandlers = require('./handlers/tokenHandler');
const checkoutHandler = require('./handlers/checkoutHandler');

const { orderHandler } = require('./handlers/orderHandler');
const { imagesHandler } = require('./handlers/imageHandler');

const handlers = {
  async ping() {
    return helpers.generateResponseObj();
  },
  async notFound() {
    return helpers.generateResponseObj(404, 'Not Found');
  },
  async invalidPayload() {
    return helpers.generateResponseObj(
      400,
      'Invalid Data sent, please check your payload and try again'
    );
  },
  ...userHandlers,
  ...tokensHandlers,
  ...orderHandler,
  ...checkoutHandler,
  ...imagesHandler,
};

module.exports = Object.freeze(handlers);
