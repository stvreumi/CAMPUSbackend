/** @module UserDataSource */
const { DataSource } = require('apollo-datasource');
const { FieldValue } = require('firebase-admin').firestore;
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
  constructor(userCollectionRef, userResearchCollectionRef) {
    super();

    // for authentication
    this.userCollectionRef = userCollectionRef;
    this.userResearchCollectionRef = userResearchCollectionRef;
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

    await userDocRef.set(
      {
        hasReadGuide: true,
      },
      { merge: true }
    );
    return true;
  }

  /**
   *
   * @param {{uid: string}} param
   * @returns {Number}
   */
  async getUserAddTagNumber({ uid }) {
    const docSnapshot = await this.userCollectionRef.doc(uid).get();
    if (!docSnapshot.exists) return null;

    const { userAddTagNumber } = docSnapshot.data();
    if (!userAddTagNumber) return 0;
    return userAddTagNumber;
  }

  /**
   *
   * @param {{uid: string, action: string}} param
   */
  async updateUserAddTagNumber({ uid, action }) {
    const userDocRef = this.userCollectionRef.doc(uid);
    if (action === 'increment') {
      await userDocRef.set(
        { userAddTagNumber: FieldValue.increment(1) },
        { merge: true }
      );
    }
    // Currently, the decrement function would not be used.
    // When a tag is deleted, the firebase function would be triggered and decrement
    // related userAddTagNumber.
    if (action === 'decrement') {
      await userDocRef.set(
        { userAddTagNumber: FieldValue.increment(-1) },
        { merge: true }
      );
    }
  }

  // For research
  async getHasReadGuideStatusResearch({ userInfo }) {
    const { logIn, uid } = userInfo;
    checkUserLogIn(logIn);

    const userDocRef = this.userResearchCollectionRef.doc(uid);

    const doc = await userDocRef.get();

    if (doc.exists && doc.data().hasReadGuide === true) {
      return true;
    }

    return false;
  }

  async setHasReadGuideResearch({ userInfo }) {
    const { logIn, uid } = userInfo;
    checkUserLogIn(logIn);

    const userDocRef = this.userResearchCollectionRef.doc(uid);

    await userDocRef.set(
      {
        hasReadGuide: true,
      },
      { merge: true }
    );
    return true;
  }
} // class UserDataSource

module.exports = UserDataSource;
