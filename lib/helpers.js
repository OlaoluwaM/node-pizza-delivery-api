// A file containing some helper functions for the application

// Dependencies
const crypto = require('crypto');
const config = require('./config');

function isRequired(str) {
  const message = `${str} is a required parameter`;
  console.error(message);
}

const regexObj = Object.freeze({
  emailRegex: new RegExp(/^[^\s@]+@[^\s@]+\.[^\s@]+$/),
  passwordRegex: new RegExp(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[#$^+=!*()@%&]).{8,}$/),
});

function hash(str) {
  if (!validateType(str, 'string')) return false;
  return crypto.createHmac('sha256', config.hashingSecret).update(str).digest('hex');
}

function normalize(value) {
  const valueAsString = JSON.stringify(value, (_, val) =>
    val === '' || val === void 0 ? null : val
  ).trim();
  return JSON.parse(valueAsString);
}

function validateType(value, desiredType) {
  if (!value) return false;
  const normalizedValue = normalize(value);
  const rawType = Object.prototype.toString
    .call(normalizedValue)
    .replace(/\W/g, '')
    .split('object')[1]
    .toLowerCase();

  return rawType === desiredType;
}

/**
 * @param {number} statusCode
 * @param {string} data
 * @description generates the result, in the required format, for the server's response to the request
 */

function generateResponseObj(statusCode = 200, data = {}) {
  if (validateType(data, 'object') || validateType(data, 'array')) {
    data = JSON.stringify(data);
  }
  return { statusCode, returnedData: data };
}

function normalizeToObject(str) {
  if (!str) return {};
  return JSON.parse(str);
}

function extractSanitizedDataFrom(obj) {
  if (!obj) return false;

  const returnedObject = {
    name: validateType(obj?.name, 'string') ? obj.name.trim() : false,

    password:
      validateType(obj?.password, 'string') && regexObj.passwordRegex.test(obj.password)
        ? obj.password.trim()
        : false,

    streetAddress: validateType(obj?.streetAddress, 'string') ? obj.streetAddress.trim() : false,

    email:
      validateType(obj?.email, 'string') && regexObj.emailRegex.test(obj.email)
        ? obj.email.trim()
        : false,

    Id: validateType(obj?.Id, 'string') && obj.Id.trim().length === 24 ? obj.Id : false,

    orders:
      validateType(obj?.orders, 'array') && obj.orders.length > 0
        ? obj.orders.length <= config.orderLimit
          ? obj.orders
          : 'Too many orders'
        : false,
  };

  return Object.fromEntries(Object.entries(returnedObject).filter(v => !!v[1]));
}

function checkForRequiredField(dataSet, reqData = []) {
  const sanitizedDataObj = extractSanitizedDataFrom(dataSet);

  const uncleanData = reqData.find(key => !!sanitizedDataObj[key] === false);

  if (uncleanData) {
    const errorMsg = `Error, ${uncleanData} field is invalid or missing`;
    console.error(`${errorMsg} \n`);
    return generateResponseObj(400, errorMsg);
  }

  return sanitizedDataObj;
}

function convertDollarToFloat(dollar, wholeNum = false) {
  const floatString = dollar.replace('$', '');
  if (wholeNum) return convertToNumber(floatString);
  return parseFloat(floatString);
}

function convertToNumber(floatString) {
  return parseInt(floatString.toString().replace('.', ''));
}

function errorWrapper(error = {}, statusCode = 500) {
  if (validateType(error, 'object') || validateType(error, 'array')) {
    error = JSON.stringify(data);
  }
  return { error, statusCode };
}

const helpersFuncObj = Object.freeze({
  generateResponseObj,
  validateType,
  normalizeToObject,
  regexObj,
  hash,
  extractSanitizedDataFrom,
  checkForRequiredField,
  convertDollarToFloat,
  errorWrapper,
});

module.exports = helpersFuncObj;
