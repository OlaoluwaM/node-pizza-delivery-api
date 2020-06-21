// Config File

// Dependencies

const env = {
  development: Object.freeze({
    httpPort: 3000,
    httpsPort: 3001,
    hashingSecret: 'thisIsAlsoASecret',
  }),

  production: Object.freeze({
    httpPort: 5000,
    httpsPort: 5001,
    hashingSecret: 'wrfrLNLHBLHU2#29DDnewi',
  }),
};

const currentEnv =
  typeof process.env.NODE_ENV === 'string' ? process.env.NODE_ENV.toLowerCase() : '';

const envToExport = env[currentEnv] ?? env['development'];

module.exports = Object.seal(envToExport);
