const { ApolloServer } = require('apollo-server');

const typeDefs = require('./schema/schema');
const resolvers = require('./resolvers/resolvers');
const CampusPubSub = require('./CampusPubSub');
/** dataSources */
const TagDataSource = require('./datasources/TagDataSource');
const StorageDataSource = require('./datasources/StorageDataSource');
const AuthDataSource = require('./datasources/AuthDataSource');
const UserDataSource = require('./datasources/UserDataSource');

/**
 * @typedef {import('firebase-admin')} firebaseAdmin
 */

/**
 *
 * @param {firebaseAdmin} admin
 */
const dataSourcesGenerator = admin => {
  const firestore = admin.firestore();
  let archivedThreshold = 10;
  // the return function is the unsubscriber
  const archivedThresholdOfNumberOfUpVoteObserver = firestore
    .collection('setting')
    .doc('tag')
    .onSnapshot(docSnapshot => {
      if (docSnapshot.exists) {
        archivedThreshold = docSnapshot.data().archivedThreshold;
      }
    });
  const firebaseServiceReference = {
    tagDataCollectionRef: firestore.collection('tagData'),
    runTransaction: firestore.runTransaction,
    userCollectionRef: firestore.collection('user'),
    auth: admin.auth(),
    bucket: admin.storage().bucket(),
  };

  return () => ({
    // firestore collection reference
    tagDataSource: new TagDataSource(
      firebaseServiceReference.tagDataCollectionRef,
      archivedThreshold,
      firestore
    ),
    userDataSource: new UserDataSource(
      firebaseServiceReference.userCollectionRef
    ),
    // other firebase service
    storageDataSource: new StorageDataSource(firebaseServiceReference.bucket),
    authDataSource: new AuthDataSource(firebaseServiceReference.auth),
  });
};

const subscriptions = {
  path: '/subscriptions',
  onConnect: (connectionParams, webSocket, context) => {
    console.log('Client connected');
  },
  onDisconnect: (webSocket, context) => {
    console.log('Client disconnected');
  },
};

/**
 * Apollo server generator(production/test)
 * @param {object} param
 * @param {boolean} param.production true: production server, otherwise test server
 *  (different in context)
 * @param {boolean} param.introspection true: enables introspection of the schema
 * @param {boolean} param.playground true: enables the playground when connect to
 *  the graphql endpoint
 * @param {(logIn: boolean) => object | undefined} param.contextInTest
 * @returns ApolloServer Generator
 */
function apolloServerGenerator({
  test = false,
  introspection = true,
  // https://github.com/apollographql/apollo-server/issues/5145
  // make the subscription result scrollable
  playground = { version: '1.7.40' },
  contextInTest = undefined,
}) {
  const apolloServerInstanciator = (dataSources, context) =>
    new ApolloServer({
      typeDefs,
      resolvers,
      dataSources,
      subscriptions,
      formatError: error => {
        console.log(error);
        return error;
      },
      context,
      introspection,
      playground,
    });

  // context
  const contextInProduction =
    (dataSources, firestore) =>
    async ({ req, connection }) => {
      const contextReturn = {};
      if (connection) {
        const pubsub = new CampusPubSub(firestore);
        contextReturn.pubsub = pubsub;
        contextReturn.dataSources = dataSources();
      }

      if (req) {
        const { authorization } = req.headers;
        const userInfo =
          await dataSources().authDataSource.getUserInfoFromToken(
            authorization
          );
        contextReturn.userInfo = userInfo;
      }

      return contextReturn;
    };
  if (test === true) {
    /**
     * Test server
     * @param {{admin: firebaseAdmin, logIn: boolean}} param
     * @returns
     */
    const testServerGenerator = ({ admin, logIn }) => {
      const dataSources = dataSourcesGenerator(admin);
      return apolloServerInstanciator(dataSources, contextInTest(logIn));
    };
    return testServerGenerator;
  }
  /**
   * Production server
   * @param {{admin: firebaseAdmin}} param
   */
  const productionServerGenerator = ({ admin }) => {
    const dataSources = dataSourcesGenerator(admin);
    return apolloServerInstanciator(
      dataSources,
      contextInProduction(dataSources, admin.firestore())
    );
  };
  return productionServerGenerator;
}

module.exports = { apolloServerGenerator, dataSourcesGenerator };
