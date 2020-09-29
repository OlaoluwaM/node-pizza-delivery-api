// File for handling request in the user's route

// Dependencies
const auth = require('../auth');
const _data = require('../data');
const helpers = require('../helpers');
const CustomError = require('../custom-error');

const { checkForRequiredField } = helpers;
const {
  _tokens: { post: generateUserTokens },
} = require('./tokenHandler');

const usersMethodObj = {
  /**
   * @name Users - post
   * @param {{}} data
   * @description post method for users route
   * @requires {name, password, streetAddress, email}
   * Optional data: none
   */

  async post(reqData) {
    const { email, password } = reqData;

    const hashedPassword = { password: helpers.hash(password) };
    const objectToStore = { ...reqData, ...hashedPassword };

    await _data.create('users', email, objectToStore);

    const tokenCreationResponse = await generateUserTokens({ payload: { email, password } });

    const { statusCode, returnedData } = tokenCreationResponse;
    return helpers.generateResponseObj(statusCode, returnedData);
  },

  /**
   * @name Users - get
   * @param {{}} data
   * @description get method for users route
   * @requires {email}
   * Optional data: none
   */

  async get({ email }) {
    const rawResult = await _data.read('users', email);

    const { data: fileData } = rawResult;
    delete fileData.password, delete fileData.hasToken;

    return helpers.generateResponseObj(200, fileData);
  },

  /**
   * @name Users - put
   * @param {{}} data
   * @description put method for users route
   * @requires email
   * Optional data: name, streetAddress, password
   */

  async put({ email }, data) {
    const {
      payload,
      headers: { token: tokenId },
    } = data;

    const updatedDataObj = helpers.extractSanitizedDataFrom(payload);
    const availableUpdateFields = Object.keys(updatedDataObj);

    if (availableUpdateFields.length === 0) {
      return helpers.generateResponseObj(400, 'No data to update');
    }

    const successMsg = 'User data was successfully updated';

    const resArray = await Promise.all([
      await _data.read('users', email),
      await _data.read('tokens', tokenId),
    ]);

    const { 0: oldUserData, 1: currentToken } = resArray;

    if (updatedDataObj?.password) {
      const { password } = updatedDataObj;
      updatedDataObj.password = helpers.hash(password);
    }

    if (updatedDataObj?.email && email !== updatedDataObj?.email) {
      try {
        await Promise.all([
          await _data.create('users', updatedDataObj.email, {
            ...oldUserData.data,
            ...updatedDataObj,
          }),
          await _data.update('tokens', tokenId, {
            ...currentToken.data,
            email: updatedDataObj.email,
          }),
        ]);

        await _data.delete('users', email);

        return helpers.generateResponseObj(200, "User's email was successfully updated");
      } catch (error) {
        throw new CustomError(`An error occurred updating user's email. ${error}`);
      }
    }

    const newUserData = { ...oldUserData.data, ...updatedDataObj };

    try {
      await _data.update('users', email, newUserData);
    } catch (error) {
      throw new CustomError("An error occurred while updating user's data");
    }

    return helpers.generateResponseObj(200, successMsg);
  },

  /**
   * @name Users - delete
   * @param {{}} data
   * @description delete method for users route
   * @requires email
   * Optional data: none
   */

  async delete({ email }, data) {
    const {
      headers: { token: tokenId },
    } = data;

    try {
      await Promise.all([
        await _data.delete('users', email),
        await _data.delete('tokens', tokenId),
      ]);
    } catch {
      throw new CustomError('An error occurred while deleting your data, please try again later');
    }

    return helpers.generateResponseObj(200, 'User was successfully deleted');
  },
};

const userHandlers = {
  async users(data) {
    const reqData = ['email', 'name', 'password', 'streetAddress'];
    const { method, payload, queryStringObject, headers } = data;

    let reqInputObj, authenticationResult;

    if (method === 'post') {
      reqInputObj = checkForRequiredField(payload, reqData);

      if (reqInputObj?.statusCode) return reqInputObj;
    } else {
      reqInputObj = checkForRequiredField(queryStringObject, [reqData[0]]);
      if (reqInputObj?.statusCode) return reqInputObj;

      authenticationResult = await auth.verifyToken(headers, reqInputObj.email);

      if (authenticationResult.type === 'error' || !authenticationResult.isValid) {
        return helpers.generateResponseObj(401, authenticationResult?.error ?? 'Invalid token');
      }

      data.headers = { ...headers, token: authenticationResult?.newToken?.Id || headers.token };
    }

    try {
      const response = await userHandlers['_users'][method](reqInputObj, data);

      if (authenticationResult?.newToken) response.token = authenticationResult.newToken;

      return response;
    } catch (error) {
      if (error instanceof CustomError) {
        const { message, statusCode } = error;
        console.error(`${message} \n`);
        return helpers.generateResponseObj(statusCode, message);
      }

      console.error(`${error} \n`);
      return helpers.generateResponseObj(500, error);
    }
  },

  _users: Object.freeze(usersMethodObj),
};

module.exports = Object.freeze(userHandlers);
