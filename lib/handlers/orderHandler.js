// File for handling request to the menu route

// Dependencies
const auth = require('../auth');
const _data = require('../data');
const helpers = require('../helpers');
const { orderLimit } = require('../config');

const private = {
  MenuArrayToObject(menuArray) {
    return Object.fromEntries(menuArray.map(arr => [arr[0], `$${arr[1]}`]));
  },
  gluttonErrorMessage(orders) {
    return [
      `Slow down, you can\'t order more than ${orderLimit} items at once, remove ${
        orders.length - orderLimit
      } item(s)`,
    ];
  },
  generateEmptyCart() {
    return { totalPrice: '$0', orderCount: '0 items' };
  },
  generateUserCart(menuArray, OrderArray, prevUserCart) {
    const menuObject = this.MenuArrayToObject(menuArray);

    const cartObj = OrderArray.reduce((orderObj, orderItem) => {
      if (!menuObject[orderItem]) {
        throw [`${orderItem} is not available in our menu. Order wasn't saved`];
      }

      const price = helpers.convertDollarToFloat(menuObject[orderItem]);
      const count = orderObj[orderItem]
        ? helpers.convertDollarToFloat(orderObj[orderItem]) / price
        : 1;

      orderObj[orderItem] = orderObj[orderItem]
        ? `$${helpers.convertDollarToFloat(orderObj[orderItem]) + price} (x${count + 1})`
        : `$${price} (x1)`;

      orderObj['totalPrice'] = `$${helpers.convertDollarToFloat(orderObj['totalPrice']) + price}`;
      orderObj['orderCount'] = `${(parseInt(orderObj['orderCount']) + 1).toFixed(0)} item(s)`;
      return orderObj;
    }, prevUserCart ?? { totalPrice: '$0', orderCount: '0 items' });

    const formattedTotal = `$${helpers.convertDollarToFloat(cartObj['totalPrice']).toFixed(2)}`;
    const orderCount = cartObj['orderCount'];

    delete cartObj['totalPrice'];
    delete cartObj['orderCount'];

    return { ...cartObj, orderCount, totalPrice: formattedTotal };
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

  async get() {
    const { type, data: menuArray } = await _data.read('menu', 'menu');
    if (type === 'error') throw menuArray;

    const menuObject = private.MenuArrayToObject(menuArray);

    return helpers.generateResponseObj(200, menuObject);
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
    const {
      queryStringObject: { email },
      payload,
    } = data;

    const ordersObj = helpers.checkForRequiredField(payload, ['orders']);
    if (ordersObj?.statusCode) return ordersObj;

    const { orders } = ordersObj;
    if (helpers.validateType(orders, 'string')) throw private.gluttonErrorMessage(orders);

    const resultArray = await Promise.all([_data.read('menu', 'menu'), _data.read('users', email)]);

    const promiseError = resultArray.find(({ type }) => type === 'error');
    if (promiseError) throw `An error occurred, ${promiseError.data}`;

    const {
      '0': { data: menuArray },
      '1': { data: prevUserData },
    } = resultArray;

    const userCart = private.generateUserCart(menuArray, orders);

    const updatedUserData = {
      ...prevUserData,
      cart: { ...userCart },
    };

    const errorObj = await _data.update('users', email, updatedUserData);
    if (errorObj) throw errorObj.data;

    return helpers.generateResponseObj(200, 'Order saved!');
  },

  /**
   * @name order - get
   * @param {{}} data
   * @description get method for order route
   * @requires {header, email}
   * Optional data: none
   */

  async get(data) {
    const {
      queryStringObject: { email },
    } = data;

    const { type, data: userData } = await _data.read('users', email);
    if (type === 'error') throw userData;

    if (userData?.cart && Object.keys(userData.cart).length > 0) {
      return helpers.generateResponseObj(200, JSON.stringify(userData.cart, null, 2));
    } else return helpers.generateResponseObj(200, 'Nothing in your cart');
  },

  /**
   * @name order - put
   * @param {{}} data
   * @description put method for order route
   * @requires {headers, email}
   * Optional data: {menu Item}
   */

  async put(data) {
    const {
      queryStringObject: { email },
      payload,
    } = data;

    const ordersObj = helpers.checkForRequiredField(payload, ['orders']);
    if (ordersObj?.statusCode) return ordersObj;

    const { orders } = ordersObj;
    if (helpers.validateType(orders, 'string')) throw private.gluttonErrorMessage(orders);

    const resultArray = await Promise.all([_data.read('menu', 'menu'), _data.read('users', email)]);

    const promiseError = resultArray.find(({ type }) => type === 'error');
    if (promiseError) throw `An error occurred, ${promiseError.data}`;

    const {
      '0': { data: menuArray },
      '1': { data: prevUserData },
    } = resultArray;

    const currentCart = prevUserData?.cart;
    const cartCount = parseInt(currentCart.orderCount);

    if (cartCount + orders.length > orderLimit) {
      throw [`You can only add ${orderLimit - parseInt(cartCount)} more item(s) to your cart`];
    } else if (cartCount > orderLimit) {
      throw ["Your cart has reached max capacity, you can't add more items"];
    } else if (!currentCart) throw ['This user has no cart to update'];

    const newCart = private.generateUserCart(menuArray, orders, currentCart);
    const newUserData = { ...prevUserData, cart: newCart };

    const errorObj = await _data.update('users', email, newUserData);
    if (errorObj) throw errorObj.data;

    return helpers.generateResponseObj(200, 'Your cart has been updated!');
  },

  /**
   * @name order - delete
   * @param {{}} data
   * @description delete method for order route
   * @requires {}
   * Optional data: none
   */

  async delete(data) {
    const {
      queryStringObject: { email },
      payload,
    } = data;

    const clearAll = helpers.validateType(payload?.clearAll, 'boolean') ? payload.clearAll : false;
    if (!clearAll) throw ['clearAll field is missing or invalid'];

    const { type, data: prevUserData } = await _data.read('users', email);
    if (type === 'error') throw prevUserData;

    let currentCart = prevUserData?.cart;

    if (parseInt(currentCart.orderCount) > 0) {
      const updatedUserData = { ...prevUserData, cart: private.generateEmptyCart() };
      const errorObj = await _data.update('users', email, updatedUserData);
      if (errorObj) throw errorObj.data;
      return helpers.generateResponseObj(200, 'Cart emptied!');
    } else {
      return helpers.generateResponseObj(200, 'Cart is already empty');
    }
    // TODO support deleting individual items as well
  },
};

const orderHandler = {
  async order(data) {
    const { method, trimmedPath, headers, queryStringObject } = data;

    const resultObj = helpers.checkForRequiredField(queryStringObject, ['email']);
    if (resultObj?.statusCode) return resultObj;

    const result = await auth.verifyToken(headers, resultObj.email);
    if (result.type === 'error' || !result.isValid) {
      return helpers.generateResponseObj(401, result?.error ?? 'Invalid token');
    }

    try {
      if (trimmedPath.search(/\/menu*/) === -1) {
        return await orderHandler['_order'][method](data);
      } else {
        return method === 'get'
          ? await orderHandler['_menu'][method]()
          : helpers.generateResponseObj(405, 'Method is not allowed for this route');
      }
    } catch (error) {
      const errorMsg = error[0] || error;
      const statusCode = helpers.validateType(error, 'array') ? 400 : 500;

      console.error(`${errorMsg} \n`);
      return helpers.generateResponseObj(statusCode, errorMsg);
    }
  },

  _menu: Object.freeze(menuEndpointMethods),
  _order: Object.freeze(orderEndpointMethods),
};

module.exports = Object.freeze(orderHandler);
