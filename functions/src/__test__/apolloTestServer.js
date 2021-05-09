/** @module src/index */
const { apolloServerGenerator } = require('../apolloServerGenerator');

const apolloTestServer = apolloServerGenerator({ test: true });

module.exports = apolloTestServer;
