// File that handles requests to server

// Dependencies
const helpers = require('./helpers');
const userHandlers = require('./handlers/userHandlers');
const tokensHandlers = require('./handlers/tokenHandler');
const orderHandlers = require('./handlers/orderHandler');
const checkoutHandler = require('./handlers/checkoutHandler');

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
  ...orderHandlers,
  ...checkoutHandler,
};

module.exports = Object.freeze(handlers);
