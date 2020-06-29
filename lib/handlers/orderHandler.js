// File for handling request to the menu route

// Dependencies
const auth = require('../auth');
const _data = require('../data');
const helpers = require('../helpers');
const { orderLimit } = require('../config');

const privateMethods = {
  formatMenuData(menuArray) {
    return Object.fromEntries(menuArray.map(arr => [arr[0], `$${arr[1]}`]));
  },
};

const menuEndpointMethods = {
  /**
   * @name menu - get
   * @param {{}} data
   * @description get method for menu route
   * @requires Id
   * Optional data: none
   */

  async get(data) {
    const { queryStringObject, headers } = data;
    const reqData = ['email'];

    const resultObj = helpers.checkForRequiredField(queryStringObject, reqData);
    if (resultObj?.statusCode) return resultObj;

    const result = await auth.verifyToken(headers, resultObj.email);
    if (result.type === 'error' || !result.isValid) {
      return helpers.generateResponseObj(401, result?.error ?? 'Invalid token');
    }

    try {
      const { type, data: menuArray } = await _data.read('menu', 'menu');
      if (type === 'error') throw menuArray;

      const menuObject = privateMethods.formatMenuData(menuArray);

      return helpers.generateResponseObj(200, menuObject);
    } catch (error) {
      console.error(`${error} \n`);
      const statusCode = error === 'Invalid token' ? 400 : 500;
      return helpers.generateResponseObj(statusCode, error);
    }
  },
};

const orderEndpointMethods = {
  /**
   * @name order - post
   * @param {{}} data
   * @description post method for order route
   * @requires {header(token), email, order(greater than 0)}
   * Optional data: none
   */

  async post(data) {
    const { queryStringObject, headers, payload } = data;
    const reqData = ['email'];

    const resultObj = helpers.checkForRequiredField(queryStringObject, reqData);
    if (resultObj?.statusCode) return resultObj;

    const result = await auth.verifyToken(headers, resultObj.email);
    if (result.type === 'error' || !result.isValid) {
      return helpers.generateResponseObj(401, result?.error ?? 'Invalid token');
    }

    const currentOrder =
      helpers.validateType(payload?.orders, 'array') && payload.orders.length > 0
        ? payload.orders
        : false;

    try {
      if (!currentOrder) throw ["You haven't ordered yet. Check the menu for what you like"];
      if (currentOrder.length > orderLimit) {
        throw [`Slow down, you can\'t order more than ${orderLimit} items at once`];
      }

      const { email } = queryStringObject;

      const resultArray = await Promise.all([
        _data.read('menu', 'menu'),
        _data.read('users', email),
      ]);
      if (resultArray.some(({ type }) => type === 'error')) {
        throw 'An error occurred fetching menu and/or user data';
      }

      const {
        '0': { data: menuArray },
        '1': { data: prevUserData },
      } = resultArray;

      const menuObject = privateMethods.formatMenuData(menuArray);
      const userOrderObj = currentOrder.reduce(
        (orderObj, orderItem) => {
          // TODO make case insensitive
          if (!menuObject[orderItem]) {
            throw [`${orderItem} is not available in our menu. Order wasn't saved`];
          }

          const price = helpers.convertDollarToFloat(menuObject[orderItem]);
          const count = orderObj[orderItem] && parseFloat(orderObj[orderItem]) / price;

          orderObj[orderItem] = orderObj[orderItem]
            ? `${parseFloat(orderObj[orderItem]) + price} (x${count + 1})`
            : `${price} (x1)`;

          orderObj['total'] += price;
          return orderObj;
        },
        { total: 0 }
      );

      const formattedTotal = `$${userOrderObj['total'].toFixed(2)}`;
      delete userOrderObj['total'];

      const updatedUserData = {
        ...prevUserData,
        cart: { ...userOrderObj, total: formattedTotal },
      };

      const errorObj = await _data.update('users', email, updatedUserData);
      if (errorObj) throw errorObj.data;

      return helpers.generateResponseObj(200, 'Order saved!');
    } catch (error) {
      const errorMsg = error[0] || error;
      const statusCode = helpers.validateType(error, 'array') ? 400 : 500;

      console.error(`${errorMsg} \n`);
      return helpers.generateResponseObj(statusCode, errorMsg);
    }
  },

  /**
   * @name order - get
   * @param {{}} data
   * @description get method for order route
   * @requires {header, email}
   * Optional data: none
   */

  async get(data) {
    const { headers, queryStringObject } = data;
    const reqData = ['email'];

    const resultObj = helpers.checkForRequiredField(queryStringObject, reqData);
    if (resultObj?.statusCode) return resultObj;

    const result = await auth.verifyToken(headers, resultObj.email);
    if (result.type === 'error' || !result.isValid) {
      return helpers.generateResponseObj(401, result?.error ?? 'Invalid token');
    }

    try {
      const { email } = queryStringObject;
      const { type, data: userData } = await _data.read('users', email);
      if (type === 'error') throw userData;

      const orderObj = userData?.cart;

      if (!orderObj || Object.keys(orderObj).length === 0) {
        return helpers.generateResponseObj(200, 'Nothing in your cart');
      } else return helpers.generateResponseObj(200, JSON.stringify(orderObj, null, 2));
    } catch (error) {
      console.error(`${error} \n`);
      return helpers.generateResponseObj(500, error);
    }
  },

  /**
   * @name order - put
   * @param {{}} data
   * @description put method for order route
   * @requires
   * Optional data: none
   */

  async put(data) {},

  /**
   * @name order - delete
   * @param {{}} data
   * @description delete method for order route
   * @requires
   * Optional data: none
   */

  async delete(data) {},
};

const orderHandler = {
  order(data) {
    const { method, trimmedPath } = data;

    if (trimmedPath.search(/\/menu*/) > -1) {
      return method === 'get'
        ? orderHandler['_menu'][method](data)
        : helpers.generateResponseObj(405, 'Method is not allowed for this route');
    } else return orderHandler['_order'][method](data);
  },

  _menu: Object.freeze(menuEndpointMethods),
  _order: Object.freeze(orderEndpointMethods),
};

module.exports = Object.freeze(orderHandler);
