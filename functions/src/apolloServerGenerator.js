const { ApolloServer } = require('apollo-server-express');

const typeDefs = require('./schema/schema');
const resolvers = require('./resolvers/resolvers');
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
  playground = true,
  contextInTest = undefined,
}) {
  const apolloServerInstanciator = (dataSources, context) =>
    new ApolloServer({
      typeDefs,
      resolvers,
      dataSources,
      formatError: error => {
        console.log(error);
        return error;
      },
      context,
      introspection,
      playground,
    });

  // context
  const contextInProduction = dataSources => async ({ req }) => {
    const userInfo = await dataSources().authDataSource.getUserInfoFromToken(
      req
    );
    return {
      userInfo,
    };
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
      contextInProduction(dataSources)
    );
  };
  return productionServerGenerator;
}

module.exports = { apolloServerGenerator, dataSourcesGenerator };
