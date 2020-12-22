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
      await _data.doesResourceExist('users', payload.email);
    } catch (error) {
      throw new CustomError('User does not exist', 401);
    }

    const { email, password } = helpers.checkForRequiredField(payload, reqData);

    const { data: fileData } = await _data.read('users', email);

    if (fileData.password !== helpers.hash(password)) {
      throw new CustomError('Sorry your password was incorrect', 400);
    }

    if (fileData?.hasToken) {
      const { hasToken: tokenHashId } = fileData;

      try {
        const authenticationResult = await auth.verifyToken(tokenHashId, email);

        const tokenToRead = authenticationResult?.newToken?.Id || tokenHashId;
        const { data: currentToken } = await _data.read('tokens', tokenToRead);

        delete currentToken.refreshToken;
        return helpers.generateResponseObj(201, currentToken);
      } catch (err) {
        try {
          await _data.delete('tokens', tokenHashId);
        } catch (error) {
          const { statusCode } = error;

          if (statusCode >= 500) {
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
    let newAccessToken = null;

    try {
      if (method === 'post') {
        return await tokenHandler['_tokens']['post'](data);
      } else {
        const reqInputObj = helpers.checkForRequiredField(headers, ['token']);

        const emailToCheckTokenAgainst = payload?.email ?? queryStringObject?.email;
        const authenticationResult = await auth.verifyToken(
          reqInputObj.token,
          emailToCheckTokenAgainst
        );
        if (authenticationResult?.newToken) newAccessToken = authenticationResult.newToken;

        // throw '1234';
        data.headers = { ...headers, token: authenticationResult?.newToken?.Id || headers.token };
        const response = await tokenHandler['_tokens'][method](data);

        return { ...response, token: newAccessToken };
      }
    } catch (error) {
      return helpers.handleApiError(error, newAccessToken);
    }
  },

  _tokens: Object.freeze(tokensRouteMethodObj),
};

module.exports = Object.freeze(tokenHandler);
