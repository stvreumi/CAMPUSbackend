/** @module src/index */
const { apolloServerGenerator } = require('../apolloServerGenerator');
const { fakeUserInfo } = require('./testUtils');

const contextInTest = logIn => async () => {
  if (logIn) {
    return { userInfo: fakeUserInfo };
  }
  return {
    userInfo: {
      logIn: false,
      uid: 'anonymous',
      displayName: 'anonymous',
    },
  };
};

const apolloTestServer = apolloServerGenerator({ test: true, contextInTest });

module.exports = apolloTestServer;
