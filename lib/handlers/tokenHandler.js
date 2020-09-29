// File for handling requests to the tokens route

// Dependencies
const auth = require('../auth');
const _data = require('../data');
const helpers = require('../helpers');
const CustomError = require('../custom-error');

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

    try {
      await _data.doesFileExist('users', payload.email);
    } catch (error) {
      throw new CustomError('User does not exist', 401);
    }

    const { email, password } = helpers.checkForRequiredField(payload, reqData);

    const { data: fileData } = await _data.read('users', email);

    if (fileData?.hasToken) {
      const { hasToken: tokenHashId } = fileData;

      try {
        const authenticationResult = await auth.verifyToken(tokenHashId, email);

        const tokenToRead = authenticationResult?.newToken?.Id || tokenHashId;
        const { data: currentToken } = await _data.read('tokens', tokenToRead);

        delete currentToken.refreshToken;
        return helpers.generateResponseObj(200, currentToken);
      } catch (err) {
        try {
          await _data.delete('tokens', tokenHashId);
        } catch (error) {
          const { message } = error;

          if (message?.search(/no such file/i) > -1) {
            delete fileData?.hasToken;
          } else throw error;
        }
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

    await Promise.all([
      await _data.create('tokens', accessTokenId, tokenObj),
      await _data.update('users', email, updatedUserObj),
    ]);

    delete tokenObj.refreshToken;
    return helpers.generateResponseObj(201, tokenObj);
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
      queryStringObject,
    } = data;

    helpers.checkForRequiredField(queryStringObject, ['email']);

    const { data: tokenData } = await _data.read('tokens', Id);

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

    helpers.checkForRequiredField(queryStringObject, ['email']);

    const { data: prevTokenData } = await _data.read('tokens', Id);

    const refreshToken = prevTokenData.refreshToken;
    const extendedExpirationDate =
      prevTokenData.expirationDate + helpers.generateTokenExpiration(null, true);

    const newTokenDataObj = {
      Id,
      email: prevTokenData.email,
      expirationDate: extendedExpirationDate,
      refreshToken,
    };

    await _data.update('tokens', Id, newTokenDataObj);

    delete newTokenDataObj.refreshToken;
    return helpers.generateResponseObj(201, newTokenDataObj);
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
      queryStringObject,
    } = data;

    const { email } = helpers.checkForRequiredField(queryStringObject, ['email']);

    const { data: attachedUserData } = await _data.read('users', email);

    delete attachedUserData.hasToken;

    await _data.update('users', email, attachedUserData);

    await _data.delete('tokens', Id);

    return helpers.generateResponseObj(200, 'Token successfully deleted');
  },
};

const tokenHandler = {
  async tokens(data) {
    const { method, headers, payload, queryStringObject } = data;

    try {
      if (method === 'post') {
        return await tokenHandler['_tokens']['post'](data);
      } else {
        const reqInputObj = helpers.checkForRequiredField(headers, ['token']);

        try {
          await _data.read('tokens', reqInputObj.token);
        } catch (error) {
          throw new CustomError('Invalid token', 401);
        }

        const emailToCheckTokenAgainst = payload?.email ?? queryStringObject?.email;

        let authenticationResult;

        try {
          authenticationResult = await auth.verifyToken(
            reqInputObj.token,
            emailToCheckTokenAgainst
          );
        } catch (error) {
          const { message = 'Invalid token', statusCode = 401 } = error;
          throw new CustomError(message, statusCode);
        }

        data.headers = { ...headers, token: authenticationResult?.newToken?.Id || headers.token };
        const response = await tokenHandler['_tokens'][method](data);
        if (authenticationResult?.newToken) response.token = authenticationResult.newToken;

        return response;
      }
    } catch (error) {
      if (error instanceof CustomError) {
        const { message, statusCode } = error;
        return helpers.generateResponseObj(statusCode, message);
      }

      let statusCode = 500;
      console.error(`${error} \n`);

      if (
        error?.search(/password/) > -1 ||
        error?.search(/does not (belong|exist)/) > -1 ||
        error?.search(/may not exist/) > -1
      ) {
        statusCode = 400;
      }

      return helpers.generateResponseObj(statusCode, error);
    }
  },

  _tokens: Object.freeze(tokensRouteMethodObj),
};

module.exports = Object.freeze(tokenHandler);
