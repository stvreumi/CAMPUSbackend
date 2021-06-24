/** @module UserDataSource */
const { DataSource } = require('apollo-datasource');
const { checkUserLogIn } = require('./firebaseUtils');

// used for type annotation
/**
 * @typedef {import('../types').RawUserDocumentFields} RawUserDocumentFields
 * @typedef {import('firebase-admin').firestore.CollectionReference<RawUserDocumentFields>} UserCollectionRef
 *
 */

//@ts-check
class UserDataSource extends DataSource {
  /**
   * DataSource construction
   * @param {UserCollectionRef} userCollectionRef
   */
  constructor(userCollectionRef) {
    super();

    // for authentication
    this.userCollectionRef = userCollectionRef;
  }

  /**
   * This is a function that gets called by ApolloServer when being setup.
   * This function gets called with the datasource config including things
   * like caches and context. We'll assign this.context to the request context
   * here, so we can know about the user making requests
   */
  initialize(config) {
    this.context = config.context;
  }

  /**
   * Get if the user(judge by token) has read the guide.
   * @param {object} param
   * @param {DecodedUserInfoFromAuthHeader} param.userInfo upvote or cancel upvote
   * @return {Promise<boolean>} Return the status of hasReadGuide. `true` means that
   *  the user has read the guide.
   */
  async getHasReadGuideStatus({ userInfo }) {
    const { logIn, uid } = userInfo;
    checkUserLogIn(logIn);

    const userDocRef = this.userCollectionRef.doc(uid);

    const doc = await userDocRef.get();

    if (doc.exists && doc.data().hasReadGuide === true) {
      return true;
    }

    return false;
  }

  /**
   * Record if the user(judge by token) has read the guide.
   * @param {object} params
   * @param {DecodedUserInfoFromAuthHeader} params.userInfo upvote or cancel upvote
   * @return {Promise<boolean>} Return the status of set hasReadGuide. `true` is success.
   */
  async setHasReadGuide({ userInfo }) {
    const { logIn, uid } = userInfo;
    checkUserLogIn(logIn);

    const userDocRef = this.userCollectionRef.doc(uid);

    const doc = await userDocRef.get();

    if (!doc.exists) {
      await userDocRef.set(
        {
          hasReadGuide: true,
        },
        { merge: true }
      );

      return true;
    }

    return false;
  }
} // class UserDataSource

module.exports = UserDataSource;
