// File for handling request to the menu route

// Dependencies
const auth = require('../auth');
const _data = require('../data');
const helpers = require('../helpers');
const { orderLimit } = require('../config');
const CustomError = require('../custom-error');

const currentMenuFoodTypes = new Set();

function verifyOrderPayload(order) {
  if (!helpers.normalize(order)) throw new CustomError('No orders to save', 400);

  const orderData = helpers.validateType(order, 'object') ? Object.entries(order) : order;

  try {
    const orderItemsPassCheck = orderData.every(({ 1: orderObj }) => {
      return (
        helpers.checkForRequiredField(orderObj, ['quantity', 'initialPrice']) &&
        currentMenuFoodTypes.has(orderObj.type)
      );
    });

    if (!orderItemsPassCheck) throw 0;

    return orderData;
  } catch (error) {
    error = !!error ? 'Order data sent may have an error or is incomplete' : error;
    throw new CustomError(error, 400);
  }
}

const private = {
  MenuArrayToObject(menuArray) {
    return Object.fromEntries(
      menuArray.map(arr => {
        currentMenuFoodTypes.add(arr[2]);

        return [
          `${arr[0]}`,
          {
            type: arr[2],
            initialPrice: arr[1],
          },
        ];
      })
    );
  },

  maxCartCapacityCheck(count) {
    if (count - orderLimit === 1) {
      throw new CustomError("Your cart has reached max capacity, you can't add more items", 400);
    } else if (count > orderLimit) {
      throw new CustomError(
        `Error, max capacity for cart will be exceeded, remove ${count - orderLimit} item(s)`
      );
    }
  },

  generateEmptyCart() {
    return { totalPrice: 0, orderCount: 0 };
  },

  generateUserCart(menuArray, orderArray, prevUserCart) {
    const menuObject = this.MenuArrayToObject(menuArray);
    const menuItems = Object.keys(menuObject);

    orderArray = verifyOrderPayload(orderArray);

    const cartObj = orderArray.reduce((orderObj, { 0: orderName, 1: orderItem }) => {
      const matchingMenuItem = menuItems.find(itemName => itemName.includes(orderName));

      if (!matchingMenuItem) {
        // TODO Use a tag function with the literal to convert to plural tense as needed
        throw new CustomError(`${orderName} is not available in our menu. Order wasn't saved`, 400);
      }

      JSON.stringify(orderItem, (key, value) => {
        if (key === 'quantity') return value;

        const expectedValue = menuObject[matchingMenuItem][key];
        if (key && value !== expectedValue) {
          throw new CustomError(
            `Expected ${orderName} to be have ${key} as ${expectedValue} not ${value}`
          );
        } else return value;
      });

      const previousQuantity = orderObj[matchingMenuItem] ? orderObj[matchingMenuItem].quantity : 0;
      const { initialPrice, quantity: currentQuantity, type } = orderItem;

      const itemQuantity = previousQuantity + currentQuantity;
      const itemTotal = initialPrice * itemQuantity;

      orderObj[matchingMenuItem] = {
        type,
        quantity: itemQuantity,
        total: parseFloat(itemTotal.toFixed(2)),
      };

      orderObj['totalPrice'] = orderObj['totalPrice'] + initialPrice * currentQuantity;
      orderObj['orderCount'] = orderObj['orderCount'] + currentQuantity;

      return orderObj;
    }, prevUserCart ?? this.generateEmptyCart());

    const formattedTotal = parseFloat(cartObj['totalPrice'].toFixed(2));
    const orderCount = parseInt(cartObj['orderCount']);

    this.maxCartCapacityCheck(orderCount);

    delete cartObj['totalPrice'];
    delete cartObj['orderCount'];

    return { ...cartObj, orderCount, totalPrice: formattedTotal };
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

  async post(email, data) {
    const {
      payload: { orders },
    } = data;

    const resultArray = await Promise.all([
      await _data.read('menu', 'menu'),
      await _data.read('users', email),
    ]);

    const {
      0: { data: menuArray },
      1: { data: prevUserData },
    } = resultArray;

    const userCart = private.generateUserCart(menuArray, orders);

    const updatedUserData = {
      ...prevUserData,
      cart: { ...userCart },
    };

    await _data.update('users', email, updatedUserData);

    return helpers.generateResponseObj(201, 'Order saved!');
  },

  /**
   * @name order - get
   * @param {{}} data
   * @description get method for order route
   * @requires {header, email}
   * Optional data: none
   */

  async get(email) {
    const { data: userData } = await _data.read('users', email);

    if (userData?.cart.orderCount > 0) {
      return helpers.generateResponseObj(200, userData.cart);
    } else return helpers.generateResponseObj(200, 'Nothing in your cart');
  },

  /**
   * @name order - put
   * @param {{}} data
   * @description put method for order route
   * @requires {headers, email}
   * Optional data: {menu Item}
   */

  async put(email, data) {
    const {
      payload: { orders },
    } = data;

    const resultArray = await Promise.all([
      await _data.read('menu', 'menu'),
      await _data.read('users', email),
    ]);

    const {
      0: { data: menuArray },
      1: { data: prevUserData },
    } = resultArray;

    const currentCart = prevUserData?.cart;

    const newCart = private.generateUserCart(menuArray, orders, currentCart);
    const newUserData = { ...prevUserData, cart: newCart };

    await _data.update('users', email, newUserData);

    return helpers.generateResponseObj(201, 'Your cart has been updated!');
  },

  /**
   * @name order - delete
   * @param {{}} data
   * @description delete method for order route
   * @requires {}
   * Optional data: none
   */

  async delete(email) {
    const { data: prevUserData } = await _data.read('users', email);
    let currentCart = prevUserData?.cart;

    if (currentCart.orderCount > 0) {
      const updatedUserData = { ...prevUserData, cart: private.generateEmptyCart() };
      await _data.update('users', email, updatedUserData);

      return helpers.generateResponseObj(200, 'Cart emptied!');
    } else {
      return helpers.generateResponseObj(200, 'Cart is already empty');
    }
  },
};

const orderHandler = {
  async order(data) {
    const { method, trimmedPath, headers, queryStringObject } = data;

    try {
      const authenticatedEmail = helpers.checkForRequiredField(queryStringObject, ['email']);

      const authenticationResult = await auth.verifyToken(headers, authenticatedEmail.email);

      data.headers = { ...headers, token: authenticationResult?.newToken?.Id || headers.token };
      let response;

      if (trimmedPath.search(/\/menu*/) === -1) {
        response = await orderHandler['_order'][method](authenticatedEmail.email, data);
      } else {
        if (method === 'get') {
          response = await orderHandler.getMenu();
        } else throw new CustomError('Method is not allowed for this route', 405);
      }

      if (authenticationResult?.newToken) response.token = authenticationResult.newToken;

      return response;
    } catch (error) {
      if (error instanceof CustomError) {
        const { message, statusCode } = error;
        console.error(`${message} \n`);
        return helpers.generateResponseObj(statusCode, message);
      }
    }
  },

  /**
   * @name menu - get
   * @param {{}} data
   * @description get method for menu route
   * @requires Id
   * Optional data: none
   */

  async getMenu() {
    const { data: menuArray } = await _data.read('menu', 'menu');

    const menuObject = private.MenuArrayToObject(menuArray);

    return helpers.generateResponseObj(200, menuObject);
  },

  _order: Object.freeze(orderEndpointMethods),
};

module.exports = Object.freeze(orderHandler);
