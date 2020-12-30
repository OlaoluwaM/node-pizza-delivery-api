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
    let tokenData, clientUserInformation;

    try {
      tokenData = await _data.read('tokens', tokenId);
    } catch {
      throw new CustomError('Invalid token', 401);
    }

    try {
      clientUserInformation = await _data.read('users', email);
    } catch (error) {
      throw new CustomError("Error accessing this user's data", 500);
    }

    const { data } = tokenData;
    const {
      data: { hasToken: userTokenID },
    } = clientUserInformation;

    const { email: tokenEmail, expirationDate, refreshToken } = data;

    if (tokenEmail !== email || userTokenID !== tokenId) {
      throw new CustomError('Token is not for this user', 406);
    }

    if (expirationDate > Date.now()) return null;

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

    return newToken
  } catch (error) {
    throw error;
  }
}

module.exports = { verifyToken };
