/** @module src/index */
const { apolloServerGenerator } = require('./apolloServerGenerator');

const apolloServer = apolloServerGenerator({ test: false });

module.exports = apolloServer;
