// A file containing some helper functions for the application

// Dependencies
const config = require('./config');
const crypto = require('crypto');

function isRequired(str) {
  const message = `${str} is a required parameter`;
  console.error(message);
}

const regexObj = Object.freeze({
  emailRegex: new RegExp(/^[^\s@]+@[^\s@]+\.[^\s@]+$/),
  passwordRegex: new RegExp(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[#$^+=!*()@%&]).{8,}$/),
  streetAddressRegex: new RegExp(/(\d{1,}) [a-zA-Z0-9\s]+(\.)? [a-zA-Z]+(\,)? [A-Z]{2} [0-9]{5,}/),
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

    streetAddress:
      validateType(obj?.streetAddress, 'string') &&
      regexObj.streetAddressRegex.test(obj.streetAddress)
        ? obj.streetAddress.trim()
        : false,

    email:
      validateType(obj?.email, 'string') && regexObj.emailRegex.test(obj.email)
        ? obj.email.trim()
        : false,
  };

  return Object.fromEntries(Object.entries(returnedObject).filter(v => !!v[1]));
}

const helpersFuncObj = Object.freeze({
  generateResponseObj,
  validateType,
  normalizeToObject,
  regexObj,
  hash,
  extractSanitizedDataFrom,
});

module.exports = helpersFuncObj;
