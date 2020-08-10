// File for handling requests to the tokens route

// Dependencies
const auth = require('../auth');
const _data = require('../data');
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
        return helpers.generateResponseObj(200, result?.msg || 'User already has a valid token');
      } else {
        const errObj = await _data.delete('tokens', tokenHashId);
        if (errObj) throw errObj.data;
      }
    }

    const hashedPassword = helpers.hash(password);

    if (fileData.password !== hashedPassword) throw 'Incorrect password';

    const accessTokenId = helpers.generateToken();
    const refreshTokenId = helpers.generateToken('refresh');
    const tokenObj = {
      email,
      Id: accessTokenId,
      expirationDate: helpers.generateTokenExpiration(),
      refreshToken: {
        Id: refreshTokenId,
        expirationDate: helpers.generateTokenExpiration('refresh'),
      },
    };

    const updatedUserObj = {
      ...fileData,
      hasToken: accessTokenId,
    };

    const errorArray = await Promise.all([
      _data.create('tokens', accessTokenId, tokenObj),
      _data.update('users', email, updatedUserObj),
    ]);

    if (errorArray[0] || errorArray[1]) {
      throw 'An error occurred generating a token for this user';
    }

    delete tokenObj.refreshToken;
    return helpers.generateResponseObj(200, tokenObj);
  },

  /**
   * @name tokens - get
   * @param {{}} data
   * @description get method for tokens route
   * @requires tokenId
   * Optional data: none
   */

  async get(data) {
    const {
      headers: { token: Id },
    } = data;

    const { type, data: tokenData } = await _data.read('tokens', Id);
    if (type === 'error') throw tokenData;

    delete tokenData.refreshToken;
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
    const {
      queryStringObject,
      headers: { token: Id },
    } = data;

    const reqInputObj = helpers.checkForRequiredField(queryStringObject, ['email']);
    if (reqInputObj?.statusCode) return reqInputObj;

    const { type, data: prevTokenData } = await _data.read('tokens', Id);
    if (type === 'error') throw prevTokenData;

    const refreshToken = prevTokenData.refreshToken;
    const extendedExpirationDate = prevTokenData.expirationDate + 1000 * 1800;
    const newTokenDataObj = {
      Id,
      email: prevTokenData.email,
      expirationDate: extendedExpirationDate,
      refreshToken,
    };

    const errorObj = await _data.update('tokens', Id, newTokenDataObj);
    if (errorObj) throw errorObj.data;

    delete newTokenDataObj.refreshToken;
    return helpers.generateResponseObj(200, newTokenDataObj);
  },

  /**
   * @name tokens - delete
   * @param {{}} data
   * @description delete method for tokens route
   * @requires Id
   * Optional data: none
   */

  async delete(data) {
    const {
      headers: { token: Id },
    } = data;

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
    const { method, headers } = data;

    try {
      if (method === 'post') {
        return await tokenHandler['_tokens']['post'](data);
      } else {
        const reqInputObj = helpers.checkForRequiredField(headers, ['token']);
        if (reqInputObj?.statusCode) return reqInputObj;

        const { type, data: tokenData } = await _data.read('tokens', reqInputObj.token);
        if (type === 'error') throw tokenData;

        const result = await auth.verifyToken(reqInputObj.token, tokenData.email);

        if (result.type === 'error' || !result.isValid) {
          return helpers.generateResponseObj(401, result?.error ?? 'Invalid token');
        }

        return await tokenHandler['_tokens'][method](data);
      }
    } catch (error) {
      let statusCode = 500;
      console.error(`${error} \n`);

      if (error.search(/password/) > -1 || error.search(/does not belong/) > -1) statusCode = 400;
      return helpers.generateResponseObj(statusCode, error);
    }
  },

  _tokens: Object.freeze(tokensRouteMethodObj),
};

module.exports = Object.freeze(tokenHandler);
