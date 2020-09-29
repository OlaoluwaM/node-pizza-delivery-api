module.exports = class CustomError extends Error {
  constructor(message = 'An Error occurred', status = 500) {
    super();
    this.message = message;
    this.statusCode = status;
  }
};
