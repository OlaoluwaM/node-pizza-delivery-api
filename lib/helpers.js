// A file containing some helper functions for the application

function isRequired(str) {
  const message = `${str} is a required parameter`;
  console.error(message);
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
function generateResult(statusCode = 200, data = {}) {
  if (validateType(data, 'object') || validateType(data, 'array')) {
    data = JSON.stringify(data);
  }
  return { statusCode, returnedData: data };
}

const helpers = { generateResult, validateType };

module.exports = helpers;
