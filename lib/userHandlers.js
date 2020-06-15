// File for handling request in the user's route

// Dependencies
const helpers = require('./helpers');

const usersMethodObj = {
  /**
   * @name Users - post
   * @param {{}} data
   * @description post method for users route
   * @requires {}
   * Optional data:
   */

  async post(data) {
    console.log('That was a post request');
    return helpers.generateResult(404, { Error: 'There was an error' });
  },

  async get(data) {
    console.log('That was a get request');
    return helpers.generateResult(404, { Error: 'There was an error' });
  },
  async put(data) {
    console.log('That was a put request');
    return helpers.generateResult(404, { Error: 'There was an error' });
  },
  async delete(data) {
    console.log('That was a delete request');
    return helpers.generateResult(404, { Error: 'There was an error' });
  },
};

const userHandlers = {
  users(data) {
    const { method } = data;
    return userHandlers['_users'][method](data);
  },
  _users: Object.freeze(usersMethodObj),
};

module.exports = Object.freeze(userHandlers);
