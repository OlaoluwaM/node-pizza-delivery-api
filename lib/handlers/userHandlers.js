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

    try {
      await _data.create('users', email, objectToStore);
    } catch (error) {
      throw new CustomError('Sorry, user already exists', 400);
    }

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
      throw new CustomError('No data to update', 204);
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
    let newAccessToken = null;

    try {
      let reqInputObj;

      if (method === 'post') {
        reqInputObj = checkForRequiredField(payload, reqData);
      } else {
        reqInputObj = checkForRequiredField(queryStringObject, [reqData[0]]);

        newAccessToken = await auth.verifyToken(headers, reqInputObj.email);

        data.headers = { ...headers, token: newAccessToken?.Id || headers.token };
      }

      const response = await userHandlers['_users'][method](reqInputObj, data);

      return { ...response, token: newAccessToken };
    } catch (error) {
      return helpers.handleApiError(error, newAccessToken);
    }
  },

  _users: Object.freeze(usersMethodObj),
};

module.exports = Object.freeze(userHandlers);
