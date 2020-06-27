// File for handling request in the user's route

// Dependencies
const http = require('http');
const _data = require('../data');
const config = require('../config');
const helpers = require('../helpers');
const { checkForRequiredField } = helpers;

const requestOptions = {
  port: config.httpPort,
  path: '/tokens',
  method: 'POST',
};

const usersMethodObj = {
  /**
   * @name Users - post
   * @param {{}} data
   * @description post method for users route
   * @requires {name, password, streetAddress, email}
   * Optional data: none
   */

  async post(data) {
    const { payload } = data;
    const reqData = ['name', 'password', 'streetAddress', 'email'];

    const resultObj = checkForRequiredField(payload, reqData);
    if (resultObj?.statusCode) return resultObj;

    try {
      const { email, password } = resultObj;

      const hashedPassword = { password: helpers.hash(password) };
      const objectToStore = { ...resultObj, ...hashedPassword };

      const errorObj = await _data.create('users', email, objectToStore);
      if (errorObj) throw errorObj.data;

      const successMsg = 'User was created successfully with token';

      // console.log(successMsg);
      const req = http.request(requestOptions);

      req.on('error', () => {
        throw 'Error creating user token. Please create manually';
      });

      req.write(JSON.stringify({ email, password }));
      req.end();

      return helpers.generateResponseObj(200, successMsg);
    } catch (error) {
      console.error(`${error} \n`);
      return helpers.generateResponseObj(500, error);
    }
  },

  /**
   * @name Users - get
   * @param {{}} data
   * @description get method for users route
   * @requires {email}
   * Optional data: none
   */

  async get(data) {
    const reqData = ['email'];
    const { queryStringObject, headers } = data;

    const resultObj = checkForRequiredField(queryStringObject, reqData);
    if (resultObj?.statusCode) return resultObj;

    try {
      const { email } = resultObj;
      const result = await userHandlers.verifyToken(headers, email);
      if (result.type === 'error' || !result.isValid) throw result?.error ?? 'Invalid token';

      const rawResult = await _data.read('users', email);
      if (rawResult.type === 'error') throw rawResult.data;

      const { data: fileData } = rawResult;
      delete fileData.password;

      return helpers.generateResponseObj(200, JSON.stringify(fileData, null, 2));
    } catch (error) {
      console.error(`${error} \n`);
      const statusCode = error === 'Invalid token' ? 400 : 500;
      return helpers.generateResponseObj(statusCode, error);
    }
  },

  /**
   * @name Users - put
   * @param {{}} data
   * @description put method for users route
   * @requires email
   * Optional data: name, streetAddress, password
   */
  // TODO Add tokens for authentication

  async put(data) {
    const { payload, queryStringObject, headers } = data;
    const reqData = ['email'];

    const resultObj = checkForRequiredField(queryStringObject, reqData);
    if (resultObj?.statusCode) return resultObj;

    const updatedDataObj = helpers.extractSanitizedDataFrom(payload);
    const availableUpdateFields = Object.keys(updatedDataObj);

    if (availableUpdateFields.length === 0) {
      return helpers.generateResponseObj(400, 'No data to update');
    }

    try {
      const { email } = resultObj;
      const result = await userHandlers.verifyToken(headers, email);
      if (result.type === 'error' || !result.isValid) throw result?.error ?? 'Invalid token';

      const successMsg = 'User data was successfully updated';

      const { type, data } = await _data.read('users', email);
      if (type === 'error') throw data;

      if (updatedDataObj?.password) {
        const { password } = updatedDataObj;
        updatedDataObj.password = helpers.hash(password);
      }

      if (updatedDataObj?.email && email !== updatedDataObj?.email) {
        try {
          const errorObj = await _data.create('users', updatedDataObj.email, {
            ...data,
            ...updatedDataObj,
          });
          if (errorObj) throw '';

          const { statusCode } = await this.delete({ queryStringObject: { email } });
          if (statusCode !== 200) throw '';

          return helpers.generateResponseObj(200, "User's email was successfully updated");
        } catch (error) {
          return helpers.generateResponseObj(500, "An error occurred updating user's email");
        }
      }

      const newUserData = { ...data, ...updatedDataObj };
      const errorObj = await _data.update('users', email, newUserData);
      if (errorObj) throw 'An error occurred while updating user data';

      return helpers.generateResponseObj(200, successMsg);
    } catch (error) {
      console.error(`${error} \n`);
      const statusCode = error === 'Invalid token' ? 400 : 500;
      return helpers.generateResponseObj(statusCode, error);
    }
  },

  /**
   * @name Users - delete
   * @param {{}} data
   * @description delete method for users route
   * @requires email
   * Optional data: none
   */
  // TODO Delete everything related to this user

  async delete(data) {
    const { queryStringObject, headers } = data;
    const reqData = ['email'];

    const resultObj = checkForRequiredField(queryStringObject, reqData);
    if (resultObj?.statusCode) return resultObj;

    try {
      const { email } = resultObj;
      const result = await userHandlers.verifyToken(headers, email);
      if (result.type === 'error' || !result.isValid) throw result?.error ?? 'Invalid token';

      const errorObj = await _data.delete('users', email);
      if (errorObj) throw errorObj.data;

      return helpers.generateResponseObj(200, 'User was successfully deleted');
    } catch (error) {
      console.error(`${error} \n`);
      const statusCode = error === 'Invalid token' ? 400 : 500;
      return helpers.generateResponseObj(statusCode, error);
    }
  },
};

const userHandlers = {
  users(data) {
    const { method } = data;
    return userHandlers['_users'][method](data);
  },

  _users: Object.freeze(usersMethodObj),

  async verifyToken(headers, email) {
    console.log('Verifying token....');
    const tokenId =
      helpers.validateType(headers?.token, 'string') && headers.token.trim().length === 24
        ? headers.token
        : false;

    try {
      const { type, data } = await _data.read('tokens', tokenId);
      if (type === 'error') throw data;

      const { email: tokenEmail, expirationDate } = data;

      if (expirationDate > Date.now() && tokenEmail === email) {
        return { type: 'success', isValid: true };
      } else return { type: 'success', isValid: false };
    } catch (error) {
      return { type: 'error', isValid: false, error: 'User has no tokens' };
    }
  },
};

module.exports = Object.freeze(userHandlers);
