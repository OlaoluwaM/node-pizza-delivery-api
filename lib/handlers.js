// File that handles requests to server

// Dependencies
const helpers = require('./helpers');
const userHandlers = require('./handlers/userHandlers');
const tokensHandlers = require('./handlers/tokenHandler');
const orderHandlers = require('./handlers/orderHandler');
const checkoutHandler = require('./handlers/checkoutHandler');

const handlers = {
  ping() {
    return helpers.generateResponseObj();
  },
  notFound() {
    return helpers.generateResponseObj(404);
  },
  ...userHandlers,
  ...tokensHandlers,
  ...orderHandlers,
  ...checkoutHandler,
};

module.exports = Object.freeze(handlers);
