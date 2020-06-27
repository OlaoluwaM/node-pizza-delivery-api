// File for handling requests to the tokens route

// Dependencies
const _data = require('../data');
const crypto = require('crypto');
const helpers = require('../helpers');

const tokensRouteMethodObj = {
  /**
   * @name tokens - post
   * @param {{}} data
   * @description post method for token route
   * @requires {email, password}
   * Optional data: none
   */

  async post(data) {
    const { payload } = data;
    const reqData = ['email', 'password'];

    const resultObj = helpers.checkForRequiredField(payload, reqData);
    if (resultObj?.statusCode) return resultObj;

    try {
      const { email, password } = resultObj;

      const { type, data: fileData } = await _data.read('users', email);
      if (type === 'error') throw fileData;

      const hashedPassword = helpers.hash(password);

      if (fileData.password !== hashedPassword) throw 'Incorrect password';

      const tokenObj = {
        email,
        Id: crypto.randomBytes(12).toString('hex'),
        expirationDate: Date.now() + 1000 * 3600,
      };

      const errorObj = await _data.create('tokens', tokenObj.Id, tokenObj);
      if (errorObj !== void 0) throw errorObj.data;

      return helpers.generateResponseObj(200, 'User token successfully generated');
    } catch (error) {
      let statusCode = 500;
      console.error(`${error} \n`);

      if (error === 'Incorrect password') statusCode = 400;
      console.log(error);
      return helpers.generateResponseObj(statusCode, error);
    }
  },

  /**
   * @name tokens - get
   * @param {{}} data
   * @description get method for tokens route
   * @requires tokenId
   * Optional data: none
   */

  async get(data) {
    const { queryStringObject } = data;
    const reqData = ['Id'];

    const resultObj = helpers.checkForRequiredField(queryStringObject, reqData);
    if (resultObj?.statusCode) return resultObj;

    try {
      const { Id } = queryStringObject;
      const { type, data } = await _data.read('tokens', Id);
      if (type === 'error') return data;

      return helpers.generateResponseObj(200, data);
    } catch (error) {
      console.error(`${error} \n`);
      return helpers.generateResponseObj(500, error);
    }
  },

  /**
   * @name tokens - put
   * @param {{}} data
   * @description put method for tokens route
   * @requires {Id, hoursToExtend}
   * Optional data: none
   */

  async put(data) {
    const { payload } = data;
    const reqData = ['Id'];

    const resultObj = helpers.checkForRequiredField(payload, reqData);
    if (resultObj?.statusCode) return resultObj;

    const hoursToExtend =
      helpers.validateType(payload?.hoursToExtend, 'number') && payload.hoursToExtend <= 6
        ? payload.hoursToExtend
        : false;

    try {
      if (!hoursToExtend) throw 'Error, hoursToExtend field is invalid or missing';
      const { Id, hoursToExtend: extension } = payload;
      const { type, data: prevTokenData } = await _data.read('tokens', Id);
      if (type === 'error') throw prevTokenData;

      const extendedExpirationDate = prevTokenData.expirationDate + 1000 * 3600 * extension;
      const newTokenDataObj = { ...prevTokenData, expirationDate: extendedExpirationDate };

      const errorObj = await _data.update('tokens', Id, newTokenDataObj);
      if (errorObj) throw errorObj.data;
      return helpers.generateResponseObj(200, "User's token successfully extended");
    } catch (error) {
      console.error(`${error} \n`);
      return helpers.generateResponseObj(500, error);
    }
  },

  /**
   * @name tokens - delete
   * @param {{}} data
   * @description delete method for tokens route
   * @requires Id
   * Optional data: none
   */

  async delete(data) {
    const { queryStringObject } = data;
    const reqData = ['Id'];

    const resultObj = helpers.checkForRequiredField(queryStringObject, reqData);
    if (resultObj?.statusCode) return resultObj;

    try {
      const { Id } = queryStringObject;
      const errorObj = await _data.delete('tokens', Id);
      if (errorObj) throw errorObj.data;

      return helpers.generateResponseObj(200, 'Token successfully deleted');
    } catch (error) {
      console.error(`${error} \n`);
      return helpers.generateResponseObj(500, error);
    }
  },
};

const tokenHandler = {
  tokens(data) {
    const { method } = data;
    return tokenHandler['_tokens'][method](data);
  },

  _tokens: Object.freeze(tokensRouteMethodObj),
};

module.exports = Object.freeze(tokenHandler);
