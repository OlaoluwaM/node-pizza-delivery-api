// File that handles requests to server

// Dependencies
const helpers = require('./helpers');
const userHandlers = require('./userHandlers');

const handlers = {
  ping() {
    return helpers.generateResponseObj();
  },
  notFound() {
    return helpers.generateResponseObj(404);
  },
  ...userHandlers,
};

module.exports = Object.freeze(handlers);
