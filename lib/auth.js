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
      try {
        const errorObj = await _data.delete('tokens', tokenId);
        if (errorObj) return errorObj;

        const { type, data: oldUserData } = await _data.read('users', tokenEmail);
        if (type === 'error') throw oldUserData;

        const newTokenId = helpers.generateToken();
        const newToken = {
          email: tokenEmail,
          Id: newTokenId,
          expirationDate: helpers.generateTokenExpiration(),
          refreshToken,
        };

        const updatedUserData = { ...oldUserData, hasToken: newTokenId };

        // TODO Check if bug exists here
        debugger;
        const errorArr = await Promise.all([
          await _data.create('tokns', newTokenId, newToken),
          await _data.update('users', tokenEmail, updatedUserData),
        ]);

        if (errorArr[0] || errorArr[1]) {
          throw 'An error occurred refreshing the access token for this user';
        }
        delete newToken.refreshToken;

        return {
          type: 'success',
          isValid: true,
          msg: 'Refresh token used to extend access token',
          newToken,
        };
      } catch {
        throw 500;
      }
    } else throw refreshTokenIsValid;
  } catch (error) {
    if (helpers.validateType(error, 'string')) {
      return { type: 'error', isValid: false, error: 'User has no tokens' };
    } else if (helpers.validateType(error, 'number')) {
      return { type: 'error', isValid: false, error: 'There was an error verifying token' };
    } else return error;
  }
}

module.exports = { verifyToken };
