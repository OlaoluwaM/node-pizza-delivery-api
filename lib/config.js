// Config File
const { PORT = null } = process.env;
// Dependencies

// const env = {
//   development: Object.freeze({
//     httpPort: PORT || 4000,
//     hashingSecret: 'wrfrLNLHBLHU2#29DDnewi',
//     orderLimit: 10,
//   }),

//   production: Object.freeze({
//     httpPort: PORT || 5000,
//     hashingSecret: 'wrfrLNLHBLHU2#29DDnewi',
//     orderLimit: 10,
//   }),
// };

module.exports = Object.seal(
  Object.freeze({
    httpPort: PORT || 4000,
    hashingSecret: 'wrfrLNLHBLHU2#29DDnewi',
    orderLimit: 10,
  })
);
