// File containing authentication subroutines for users

// Dependencies
const _data = require('./data.js');
const helpers = require('./helpers.js');
const CustomError = require('./custom-error');

function verifyRefreshToken({ Id, expirationDate }) {
  const refreshTokenId = helpers.validateType(Id, 'string') && Id.trim().length === 30 ? Id : false;

  if (!refreshTokenId) {
    throw new CustomError('No refresh token, access token cannot be extended', 401);
  }

  if (expirationDate < Date.now()) {
    throw new CustomError('Refresh token has expired', 401);
  }

  return true;
}

async function verifyToken(headerData, email) {
  const Id = helpers.validateType(headerData, 'string') ? headerData : headerData?.token;
  const tokenId = helpers.validateType(Id, 'string') && Id.trim().length === 24 ? Id : false;

  if (!(Id || tokenId)) throw new CustomError('Request has no token associated with it', 401);

  try {
    debugger;
    const { data } = await _data.read('tokens', tokenId);

    const { email: tokenEmail, expirationDate, refreshToken } = data;

    if (tokenEmail !== email) {
      throw new CustomError('Token is not for this user', 406);
    }

    if (expirationDate > Date.now()) return { type: 'success', isValid: true };

    verifyRefreshToken(refreshToken);

    await _data.delete('tokens', tokenId);

    const { data: oldUserData } = await _data.read('users', tokenEmail);

    const newTokenId = helpers.generateToken();
    const newToken = {
      email: tokenEmail,
      Id: newTokenId,
      expirationDate: helpers.generateTokenExpiration(),
      refreshToken,
    };

    const updatedUserData = { ...oldUserData, hasToken: newTokenId };

    try {
      await Promise.all([
        await _data.create('tokens', newTokenId, newToken),
        await _data.update('users', tokenEmail, updatedUserData),
      ]);
    } catch {
      throw new CustomError('An error occurred refreshing the access token for this user');
    }

    delete newToken.refreshToken;

    return {
      type: 'success',
      isValid: true,
      msg: 'Refresh token used to extend access token',
      newToken,
    };
  } catch (error) {
    throw error;
  }
}

module.exports = { verifyToken };
