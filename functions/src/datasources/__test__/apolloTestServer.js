const { ApolloServer } = require('apollo-server-express');

const typeDefs = require('../../schema/schema');
const resolvers = require('../../resolvers/resolvers');
const FirebaseAPI = require('../firebase');
const { fakeUserInfo } = require('./testUtils');

/**
 * Apollo server instance
 * @param {object} {admin} firebase admin SDK
 * @returns {ApolloServer} ApolloServer with config
 */
function apolloTestServer({ admin, logIn }) {
  const dataSources = () => ({
    firebaseAPI: new FirebaseAPI({ admin }),
  });

  const server = new ApolloServer({
    typeDefs,
    resolvers,
    dataSources,
    formatError: error => {
      console.log('error');
      console.log(error);
      return error;
    },
    context: async () => {
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
    },
  });

  // server.applyMiddleware({ app, path: '/' });
  return server;
}

module.exports = apolloTestServer;
