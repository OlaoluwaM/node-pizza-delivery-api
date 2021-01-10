// Config File

const { PORT = 4000, ORDER_LIMIT = 10 } = process.env;

module.exports = Object.seal(
  Object.freeze({
    httpPort: PORT,
    hashingSecret: 'wrfrLNLHBLHU2#29DDnewi',
    orderLimit: ORDER_LIMIT,
  })
);
