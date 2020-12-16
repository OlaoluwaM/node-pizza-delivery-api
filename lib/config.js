// Config File
const { PORT = null } = process.env;
// Dependencies

const env = {
  development: Object.freeze({
    httpPort: PORT || 4000,
    hashingSecret: 'thisIsAlsoASecret',
    orderLimit: 10,
  }),

  production: Object.freeze({
    httpPort: PORT || 5000,
    hashingSecret: 'wrfrLNLHBLHU2#29DDnewi',
    orderLimit: 10,
  }),
};

const currentEnv =
  typeof process.env.NODE_ENV === 'string' ? process.env.NODE_ENV.toLowerCase() : '';

const envToExport = env[currentEnv] ?? env['development'];

module.exports = Object.seal(envToExport);
