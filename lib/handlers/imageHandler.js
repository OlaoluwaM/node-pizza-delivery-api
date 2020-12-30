// Facilitates image requests for food items

// Dependencies
const auth = require('../auth');
const helpers = require('../helpers');
const CustomError = require('../custom-error');

const nodeFetch = require('node-fetch');
const { createApi } = require('unsplash-js');

const unsplashServerApi = createApi({
  accessKey: process.env.UNSPLASH_ACCESS_KEY,
  fetch: nodeFetch,
});

// const controller = new AbortController();
// const signal = controller.signal;

async function getUnsplashImages(dataPayload) {
  dataPayload.count = dataPayload?.count ?? 1;

  const sanitizedQuery =
    !!helpers.normalize(dataPayload?.query) && helpers.validateType(dataPayload?.query, 'string')
      ? dataPayload.query.trim()
      : false;

  const sanitizedCount =
    !!dataPayload?.count &&
    !isNaN(parseInt(dataPayload.count)) &&
    Number.isInteger(parseInt(dataPayload.count))
      ? dataPayload.count
      : false;

  if (!sanitizedCount || !sanitizedQuery) {
    throw new CustomError('Invalid data sent. Please check and try again', 400);
  }

  let result;

  try {
    // debugger;
    result = await unsplashServerApi.search.getPhotos({
      perPage: sanitizedCount,
      query: sanitizedQuery,
      page: 1,
      orderBy: 'relevant',
    });
  } catch (error) {
    if (error?.name === 'AbortError') throw new CustomError('Fetch Aborted', 424);
    throw error;
  }

  switch (result.type) {
    case 'success': {
      const images = result.response.results.map(({ id, urls, alt_description, description }) => ({
        id,
        urls,
        alt_description,
        description,
      }));

      return helpers.generateResponseObj(200, images);
    }

    case 'error': {
      result.errors.forEach(error => console.error(error));
      throw new CustomError(result.source[0], 424);
    }

    default:
      throw new CustomError(`Could not handle ${result.type}`, 500);
  }
}

const imagesHandler = {
  async images(data) {
    const { method, payload, headers, queryStringObject } = data;
    let newAccessToken = null;

    try {
      const authenticatedEmail = helpers.checkForRequiredField(queryStringObject, ['email']);

      newAccessToken = await auth.verifyToken(headers, authenticatedEmail.email);

      data.headers = { ...headers, token: newAccessToken?.Id || headers.token };

      if (method !== 'get') throw new CustomError('Method not allowed for this route', 405);
      const response = await getUnsplashImages(payload);

      return { ...response, token: newAccessToken };
    } catch (error) {
      // if (error?.message.search(/abort/i) > -1 || error?.search(/abort/i) > -1) controller.abort();
      return helpers.handleApiError(error, newAccessToken);
    }
  },
};

module.exports = Object.freeze({ imagesHandler, getUnsplashImages });
