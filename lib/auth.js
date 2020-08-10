// File containing authentication subroutines for users

// Dependencies
const _data = require('./data.js');
const helpers = require('./helpers.js');

function verifyRefreshToken({ Id, expirationDate }) {
  const refreshTokenId = helpers.validateType(Id, 'string') && Id.trim().length === 30 ? Id : false;

  if (!refreshTokenId) {
    return {
      type: 'error',
      isValid: false,
      error: 'No refresh token, access token cannot be extended',
    };
  }

  if (expirationDate < Date.now()) {
    return { type: 'error', isValid: false, error: 'Refresh token has expired' };
  }

  return true;
}

async function verifyToken(headerData, email) {
  const Id = helpers.validateType(headerData, 'string') ? headerData : headerData?.token;
  const tokenId = helpers.validateType(Id, 'string') && Id.trim().length === 24 ? Id : false;

  try {
    const { type, data } = await _data.read('tokens', tokenId);
    if (type === 'error') throw data;

    const { email: tokenEmail, expirationDate, refreshToken } = data;
    if (tokenEmail !== email) {
      throw { type: 'error', isValid: false, error: 'Token is not for this user' };
    }

    if (expirationDate > Date.now()) return { type: 'success', isValid: true };

    const refreshTokenIsValid = verifyRefreshToken(refreshToken);

    if (refreshTokenIsValid === true) {
      const errorObj = await _data.update('tokens', tokenId, {
        Id: tokenId,
        email: tokenEmail,
        expirationDate: helpers.generateTokenExpiration(),
        refreshToken,
      });
      if (errorObj) throw 500;

      return { type: 'success', isValid: true, msg: 'Refresh token used to extend access token' };
    } else throw refreshTokenIsValid;
  } catch (error) {
    if (helpers.validateType(error, 'string')) {
      return { type: 'error', isValid: false, error: 'User has no tokens' };
    } else if (helpers.validateType(error, 'number')) {
      return { type: 'error', isValid: false, error: 'There was an error verifying token' };
    } else return errors;
  }
}

module.exports = { verifyToken };
