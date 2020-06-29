// File containing authentication subroutines for users

// Dependencies
const _data = require('./data.js');
const helpers = require('./helpers.js');

async function verifyToken(headerData, email) {
  const Id = helpers.validateType(headerData, 'string') ? headerData : headerData?.token;
  const tokenId = helpers.validateType(Id, 'string') && Id.trim().length === 24 ? Id : false;

  try {
    const { type, data } = await _data.read('tokens', tokenId);
    if (type === 'error') throw data;

    const { email: tokenEmail, expirationDate } = data;

    if (expirationDate > Date.now() && tokenEmail === email) {
      return { type: 'success', isValid: true };
    } else return { type: 'success', isValid: false };
  } catch (error) {
    return { type: 'error', isValid: false, error: 'User has no tokens' };
  }
}

module.exports = { verifyToken };
