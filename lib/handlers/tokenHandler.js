// File for handling requests to the tokens route

// Dependencies
const auth = require('../auth');
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

    const reqInputObj = helpers.checkForRequiredField(payload, reqData);
    if (reqInputObj?.statusCode) return reqInputObj;

    const { email, password } = reqInputObj;

    const { type, data: fileData } = await _data.read('users', email);
    if (type === 'error') throw fileData;

    if (fileData?.hasToken) {
      const { hasToken: tokenHashId } = fileData;
      const result = await auth.verifyToken(tokenHashId, email);

      if (result.type === 'success' && result.isValid) {
        return helpers.generateResponseObj(200, 'User already has a valid token');
      } else {
        const errObj = await _data.delete('tokens', tokenHashId);
        if (errObj) throw errObj.data;
      }
    }

    const hashedPassword = helpers.hash(password);

    if (fileData.password !== hashedPassword) throw 'Incorrect password';

    const tokenId = crypto.randomBytes(12).toString('hex');
    const tokenObj = {
      email,
      Id: tokenId,
      expirationDate: Date.now() + 1000 * 3600,
    };

    const updatedUserObj = {
      ...fileData,
      hasToken: tokenId,
    };

    const errorArray = await Promise.all([
      _data.create('tokens', tokenObj.Id, tokenObj),
      _data.update('users', email, updatedUserObj),
    ]);

    if (errorArray[0] || errorArray[1]) {
      throw 'An error occurred generating a token for this user';
    }

    return helpers.generateResponseObj(200, 'User token successfully generated');
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

    const reqInputObj = helpers.checkForRequiredField(queryStringObject, ['Id']);
    if (reqInputObj?.statusCode) return reqInputObj;

    const { Id } = reqInputObj;
    const { type, data: tokenData } = await _data.read('tokens', Id);
    if (type === 'error') throw tokenData;

    return helpers.generateResponseObj(200, tokenData);
  },

  /**
   * @name tokens - put
   * @param {{}} data
   * @description put method for tokens route
   * @requires {Id, toExtend}
   * Optional data: none
   */

  async put(data) {
    const { payload } = data;

    const reqInputObj = helpers.checkForRequiredField(payload, ['Id']);
    if (reqInputObj?.statusCode) return reqInputObj;

    const toExtend = helpers.validateType(payload?.toExtend, 'boolean') && payload.toExtend;

    if (!toExtend) throw 'Error, toExtend field is invalid or missing';

    const { Id } = reqInputObj;
    const { type, data: prevTokenData } = await _data.read('tokens', Id);

    if (type === 'error') throw prevTokenData;
    if (prevTokenData.expirationDate < Date.now()) throw "Token has expired, can't be extended ";

    const extendedExpirationDate = prevTokenData.expirationDate + 1000 * 3600;
    const newTokenDataObj = { ...prevTokenData, expirationDate: extendedExpirationDate };

    const errorObj = await _data.update('tokens', Id, newTokenDataObj);
    if (errorObj) throw errorObj.data;

    return helpers.generateResponseObj(200, "User's token successfully extended");
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

    const reqInputObj = helpers.checkForRequiredField(queryStringObject, ['Id']);
    if (reqInputObj?.statusCode) return reqInputObj;

    const { Id } = reqInputObj;

    const { type: tokenRes, data: tokenData } = await _data.read('tokens', Id);
    if (tokenRes === 'error') throw tokenData;

    const { type: userRes, data: attachedUserData } = await _data.read('users', tokenData.email);
    if (userRes === 'error') throw attachedUserData;

    delete attachedUserData.hasToken;

    const error = await _data.update('users', tokenData.email, attachedUserData);
    if (error) throw error.data;

    const errorObj = await _data.delete('tokens', Id);
    if (errorObj) throw errorObj.data;

    return helpers.generateResponseObj(200, 'Token successfully deleted');
  },
};

const tokenHandler = {
  async tokens(data) {
    const { method } = data;

    try {
      return await tokenHandler['_tokens'][method](data);
    } catch (error) {
      let statusCode = 500;
      console.error(`${error} \n`);
      if (error === 'Incorrect password') statusCode = 400;
      return helpers.generateResponseObj(statusCode, error);
    }
  },

  _tokens: Object.freeze(tokensRouteMethodObj),
};

module.exports = Object.freeze(tokenHandler);
