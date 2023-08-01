const { ApolloServer } = require('apollo-server');
const EventEmitter = require('events');
const algoliasearch = require('algoliasearch');

const logger = require('pino-caller')(require('../logger'));

const typeDefs = require('./schema/schema');
const resolvers = require('./resolvers/resolvers');
const CampusPubSub = require('./CampusPubSub');
/** dataSources */
const TagDataSource = require('./datasources/TagDataSource');
const TagResearchDataSource = require('./datasources/TagResearchDataSource');
const StorageDataSource = require('./datasources/StorageDataSource');
const AuthDataSource = require('./datasources/AuthDataSource');
const UserDataSource = require('./datasources/UserDataSource');
const { tagDataCollectionName } = require('./datasources/firestoreCollections');

/**
 * @typedef {import('firebase-admin')} firebaseAdmin
 * @typedef {import('./types').DecodedUserInfoFromAuthHeader} DecodedUserInfoFromAuthHeader
 */

// eventEmitter initialization
const campusEventEmitter = new EventEmitter();

// algolia client setting
const { ALGOLIA_APPLICATION_ID, ALGOLIA_API_KEY, ALGOLIA_INDEX_NAME } =
  process.env;
// https://www.algolia.com/doc/api-client/getting-started/instantiate-client-index/#initialize-an-index
// If we want to test, we need to create new index
// https://www.algolia.com/doc/faq/accounts-billing/can-i-test-my-implementation-in-a-sandbox-environment/
const algoliaIndexClient =
  ALGOLIA_APPLICATION_ID && ALGOLIA_API_KEY && ALGOLIA_INDEX_NAME
    ? /** @type import('algoliasearch').SearchIndex */
      algoliasearch(ALGOLIA_APPLICATION_ID, ALGOLIA_API_KEY).initIndex(
        ALGOLIA_INDEX_NAME
      )
    : null;

/**
 *
 * @param {firebaseAdmin} admin
 */
function dataSourcesGenerator(admin) {
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
    tagDataCollectionRef: firestore.collection(tagDataCollectionName),
    tagResearchDataCollectionRef: firestore.collection('tagData_research'),
    fixedTagCollectionRef: firestore.collection('fixedTag'),
    fixedTagResearchCollectionRef: firestore.collection('fixedTag_research'),
    fixedTagSubLocationCollectionRef: firestore.collection(
      'fixedTagSubLocation'
    ),
    userCollectionRef: firestore.collection('user'),
    userResearchCollectionRef: firestore.collection('user_research'),
    userActivityCollectionRef: firestore.collection('userActivity'),
    userActivityResearchCollectionRef: firestore.collection(
      'userActivity_research'
    ),
    auth: admin.auth(),
    bucket: admin.storage().bucket(),
  };

  return () => ({
    // firestore collection reference
    tagDataSource: new TagDataSource(
      firebaseServiceReference.tagDataCollectionRef,
      firebaseServiceReference.userActivityCollectionRef,
      firebaseServiceReference.fixedTagCollectionRef,
      firebaseServiceReference.fixedTagSubLocationCollectionRef,
      archivedThreshold,
      firestore,
      campusEventEmitter,
      algoliaIndexClient
    ),
    tagResearchDataSource: new TagResearchDataSource(
      firebaseServiceReference.tagResearchDataCollectionRef,
      firebaseServiceReference.userActivityResearchCollectionRef,
      firebaseServiceReference.fixedTagResearchCollectionRef,
      archivedThreshold,
      firestore,
      campusEventEmitter,
      algoliaIndexClient
    ),
    userDataSource: new UserDataSource(
      firebaseServiceReference.userCollectionRef,
      firebaseServiceReference.userResearchCollectionRef
    ),
    // other firebase service
    storageDataSource: new StorageDataSource(firebaseServiceReference.bucket),
    authDataSource: new AuthDataSource(firebaseServiceReference.auth),
  });
}

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
 *
 * @param {Function} dataSources
 * @param {Function} context
 * @param {boolean} introspection
 * @param {object} playground
 * @param {boolean} debug
 * @returns
 */
function apolloServerInstanciator(
  dataSources,
  context,
  introspection,
  playground,
  debug = false
) {
  return new ApolloServer({
    typeDefs,
    resolvers,
    dataSources,
    subscriptions,
    formatError: error => {
      const { message, path } = error;
      logger.error({ message, path });
      if (debug) logger.debug(error.extensions.exception.stacktrace);

      // mask error return to clients
      // https://www.apollographql.com/docs/apollo-server/v2/data/errors/#masking-and-logging-errors
      const maskError = new Error(error.message);
      maskError.path = error.path;
      maskError.extensions = {};
      maskError.extensions.code = error.extensions.code;
      return maskError;
    },
    // to show stacktrace
    // https://www.apollographql.com/docs/apollo-server/data/errors/#omitting-or-including-stacktrace
    debug,
    context,
    introspection,
    playground,
  });
}

function contextInProduction(dataSources, firestore) {
  const pubsub = new CampusPubSub(
    firestore,
    campusEventEmitter,
    algoliaIndexClient
  );
  return async ({ req, connection }) => {
    const contextReturn = {};
    if (connection) {
      contextReturn.pubsub = pubsub;
      contextReturn.dataSources = dataSources();
    }

    if (req) {
      const { authorization } = req.headers;
      const userInfo =
        await dataSources().authDataSource.verifyUserInfoFromToken(
          authorization
        );
      contextReturn.userInfo = userInfo;
    }

    return contextReturn;
  };
}

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
}) {
  if (test === true) {
    /**
     * Test server
     * @param {{admin: firebaseAdmin, userInfo: DecodedUserInfoFromAuthHeader}} param
     * @returns
     */
    const testServerGenerator = ({ admin, userInfo }) => {
      const dataSources = dataSourcesGenerator(admin);
      return apolloServerInstanciator(
        dataSources,
        // context
        () => ({ userInfo }),
        introspection,
        playground,
        // debug
        true
      );
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
      contextInProduction(dataSources, admin.firestore()),
      introspection,
      playground,
      // debug
      true
    );
  };
  return productionServerGenerator;
}

module.exports = { apolloServerGenerator, dataSourcesGenerator };
