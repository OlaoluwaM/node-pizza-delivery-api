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

function validateImageApiParam(count, query) {
  const sanitizedQuery =
    !!helpers.normalize(query) && helpers.validateType(query, 'string')
      ? query.toLowerCase().trim()
      : false;

  const sanitizedCount =
    !!count && !isNaN(parseInt(count)) && Number.isInteger(parseInt(count)) ? count : false;

  if (!sanitizedCount || !sanitizedQuery) {
    throw new CustomError('Invalid data sent. Please check and try again', 400);
  }

  return { count: sanitizedCount, query: sanitizedQuery };
}

async function getUnsplashImages(dataPayload, images = [], increment = 0, wantedAmount = 0) {
  dataPayload.count = dataPayload?.count ?? 1;

  let count = dataPayload.count;
  let query = dataPayload?.query;

  if (images.length === 0 && increment === 0 && wantedAmount === 0) {
    const validatedParams = validateImageApiParam(dataPayload?.count, dataPayload?.query);
    (count = validatedParams.count), (query = validatedParams.query);
    wantedAmount = count;
  }

  if (images.length === wantedAmount) return images;

  let result;

  try {
    result = await unsplashServerApi.search.getPhotos({
      perPage: count + increment,
      query,
      page: 1,
      orderBy: 'relevant',
    });
  } catch (error) {
    if (error?.name === 'AbortError') throw new CustomError('Fetch Aborted', 424);
    throw error;
  }

  switch (result.type) {
    case 'success': {
      images = result.response.results
        .map(({ id, urls, alt_description, description }) => ({
          id,
          urls,
          alt_description,
          description,
        }))
        .filter(({ alt_description }) => alt_description.includes(query));

      if (images.length < wantedAmount) {
        const returnedResult = await getUnsplashImages(
          { count, query },
          images,
          ++increment,
          wantedAmount
        );

        images = returnedResult?.returnedData ?? returnedResult;
      }

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
