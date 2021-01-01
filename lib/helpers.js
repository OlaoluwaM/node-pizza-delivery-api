// A file containing some helper functions for the application

// Dependencies
const http = require('http');
const https = require('https');
const crypto = require('crypto');
const config = require('./config');
const CustomError = require('./custom-error');

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
      validateType(obj?.password, 'string') &&
      (regexObj.passwordRegex.test(obj.password) || obj.password.length > 0)
        ? obj.password.trim()
        : false,

    streetAddress: validateType(obj?.streetAddress, 'string') ? obj.streetAddress.trim() : false,

    email:
      validateType(obj?.email, 'string') && regexObj.emailRegex.test(obj.email)
        ? obj.email.trim()
        : false,

    Id: validateType(obj?.Id, 'string') && obj.Id.trim().length === 24 ? obj.Id : false,

    token: validateType(obj?.token, 'string') && obj.token.trim().length === 24 ? obj.token : false,

    quantity: validateType(obj?.quantity, 'number') ? obj.quantity : false,

    initialPrice: validateType(obj?.initialPrice, 'number') ? obj.initialPrice : false,
  };

  return Object.fromEntries(Object.entries(returnedObject).filter(v => !!v[1]));
}

function checkForRequiredField(dataSet, reqData = []) {
  const sanitizedDataObj = extractSanitizedDataFrom(dataSet);

  const uncleanData = reqData.find(key => !!sanitizedDataObj[key] === false);

  if (uncleanData) {
    const errorMsg = `Error, ${uncleanData} is invalid or missing`;
    console.error(`${errorMsg} \n`);
    throw new CustomError(errorMsg, 400);
  }

  return sanitizedDataObj;
}

function convertDollarToFloat(dollar, wholeNum = false) {
  if (validateType(dollar, 'number')) return dollar;

  const floatString = dollar.replace('$', '');
  if (wholeNum) return convertToNumber(floatString);
  return parseFloat(floatString);
}

function convertToNumber(floatString) {
  return parseInt(floatString.toString().replace('.', ''));
}

function errorWrapper(error = {}, statusCode = 500) {
  return { error, statusCode };
}

function generateTokenExpiration(tokenType, update = false) {
  if (tokenType === 'refresh') {
    return !update ? Date.now() + 1000 * 3600 * 50.7 : 1000 * 3600 * 50.7;
  } else return !update ? Date.now() + 1000 * 1800 : 1000 * 1800;
}

async function fetch(url, options) {
  const reqType = options.protocol === 'https:' ? https : http;

  return new Promise((resolve, reject) => {
    const req = reqType.request(url ? url : options, res => {
      const chunks = [];

      res.on('data', chunk => chunks.push(chunk));
      res.on('error', err => reject(err));

      res.on('end', () => {
        if (res.statusCode === 200) {
          resolve(JSON.parse(Buffer.concat(chunks).toString()));
        } else {
          reject('There was an error with this request');
        }
      });
    });

    req.on('error', err => reject(err));
    options?.body && req.write(options.body);
    req.end();
  });
}

function generateToken(type) {
  if (type === 'refresh') {
    return crypto.randomBytes(15).toString('hex');
  } else return crypto.randomBytes(12).toString('hex');
}

function normalizeToNull(data) {
  const dataToString = JSON.stringify(data);
  const nullValues = ['{}', '[]'];
  if (data === '' || nullValues.includes(dataToString)) return null;
  return data;
}

function handleApiError(error, newAccessToken) {
  let message, statusCode;

  if (error instanceof CustomError) {
    (message = error.message), (statusCode = error.statusCode);
    console.error(`${message} \n`);
  } else {
    message = error?.message ?? error;
    statusCode = 500;
  }

  console.error(error);
  return { ...generateResponseObj(statusCode, message), token: newAccessToken };
}

function formatCurrencyForStripe(float) {
  if (Number.isInteger(float)) return float;
  const floatAsCurrency = parseFloat(float.toFixed(2));
  return floatAsCurrency * 100;
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
  generateTokenExpiration,
  fetch,
  normalize: normalizeToNull,
  generateToken,
  handleApiError,
  formatCurrencyForStripe,
});

module.exports = helpersFuncObj;
