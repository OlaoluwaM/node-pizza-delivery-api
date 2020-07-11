// File for handling request in the user's route

// Dependencies
const http = require('http');
const auth = require('../auth');
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

  async post(reqData) {
    const { email, password } = reqData;

    const hashedPassword = { password: helpers.hash(password) };
    const objectToStore = { ...reqData, ...hashedPassword };

    const errorObj = await _data.create('users', email, objectToStore);
    if (errorObj) throw errorObj.data;

    const successMsg = 'User was created successfully with token';

    const req = http.request(requestOptions);

    req.on('error', () => {
      throw 'Error creating user token. Please create manually';
    });

    req.write(JSON.stringify({ email, password }));
    req.end();

    return helpers.generateResponseObj(200, successMsg);
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
    if (rawResult.type === 'error') throw rawResult.data;

    const { data: fileData } = rawResult;
    delete fileData.password;
    delete fileData.hasToken;

    return helpers.generateResponseObj(200, JSON.stringify(fileData, null, 2));
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

    const resArray = await Promise.all([_data.read('users', email), _data.read('tokens', tokenId)]);
    const resContainsError = resArray.find(({ type }) => type === 'error');
    if (resContainsError) throw resContainsError.data;

    const { '0': oldUserData, '1': currentToken } = resArray;

    if (updatedDataObj?.password) {
      const { password } = updatedDataObj;
      updatedDataObj.password = helpers.hash(password);
    }

    if (updatedDataObj?.email && email !== updatedDataObj?.email) {
      try {
        const errorArr = await Promise.all([
          _data.create('users', updatedDataObj.email, {
            ...oldUserData.data,
            ...updatedDataObj,
          }),
          _data.update('tokens', tokenId, { ...currentToken.data, email: updatedDataObj.email }),
        ]);

        const responseContainsError = errorArr.find(obj => !!obj === true);
        if (responseContainsError) throw responseContainsError.data;

        await this.delete({ email });

        return helpers.generateResponseObj(200, "User's email was successfully updated");
      } catch (error) {
        throw `An error occurred updating user's email. ${error}`;
      }
    }

    const newUserData = { ...oldUserData.data, ...updatedDataObj };
    const errorObj = await _data.update('users', email, newUserData);
    if (errorObj) throw "An error occurred while updating user's data";

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

    const errorArray = await Promise.all([
      _data.delete('users', email),
      _data.delete('tokens', tokenId),
    ]);
    const responseContainsError = errorArray.find(obj => !!obj === true);
    if (responseContainsError) throw responseContainsError.data;

    return helpers.generateResponseObj(200, 'User was successfully deleted');
  },
};

const userHandlers = {
  async users(data) {
    const reqData = ['email', 'name', 'password', 'streetAddress'];
    const { method, payload, queryStringObject, headers } = data;

    let reqInputObj;

    if (method === 'post') {
      reqInputObj = checkForRequiredField(payload, reqData);
      if (reqInputObj?.statusCode) return reqInputObj;
    } else {
      reqInputObj = checkForRequiredField(queryStringObject, [reqData[0]]);
      if (reqInputObj?.statusCode) return reqInputObj;

      const result = await auth.verifyToken(headers, reqInputObj.email);
      if (result.type === 'error' || !result.isValid) {
        return helpers.generateResponseObj(401, result?.error ?? 'Invalid token');
      }
    }

    try {
      return await userHandlers['_users'][method](reqInputObj, data);
    } catch (error) {
      console.error(`${error} \n`);
      return helpers.generateResponseObj(500, error);
    }
  },

  _users: Object.freeze(usersMethodObj),
};

module.exports = Object.freeze(userHandlers);
