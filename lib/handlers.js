// File that handles requests to server

// Dependencies
const helpers = require('./helpers');
const userHandlers = require('./userHandlers');

const handlers = {
  ping() {
    return helpers.generateResult();
  },
  notFound() {
    return helpers.generateResult(404);
  },
  ...userHandlers,
};

module.exports = handlers;
