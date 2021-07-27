/** @module AuthDataSource */
const { DataSource } = require('apollo-datasource');
const { AuthenticationError } = require('apollo-server');
const DataLoader = require('dataloader');

// used for type annotation
/**
 * @typedef {import('firebase-admin').auth.Auth} Auth
 */

//@ts-check
class AuthDataSource extends DataSource {
  /**
   * Use admin to construct necessary entity of communication
   * @param {Auth} authOfFirebase
   */
  constructor(authOfFirebase) {
    super();

    // for authentication
    this.auth = authOfFirebase;

    // for user dataloader
    this.userDataloader = new DataLoader(async uids => {
      const { users, notFound } = await this.auth.getUsers(uids);
      const userData = {};
      users.forEach(user => {
        const { uid, displayName, email, photoURL } = user;
        userData[uid] = { uid, displayName, email, photoURL };
      });
      notFound.forEach(notFoundUser => {
        const { uid } = notFoundUser;
        userData[uid] = null;
      });
      return uids.map(({ uid }) => userData[uid]);
    });
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
   * Verify token from reqeust header and return user object
   * @param {string} authorization request object from express
   * @returns {Promise<DecodedUserInfoFromAuthHeader>}
   */
  async verifyUserInfoFromToken(authorization) {
    if (authorization) {
      const token = authorization.replace('Bearer ', '');
      try {
        // verifyIdToken return DecodedIdToken
        // https://firebase.google.com/docs/reference/admin/node/admin.auth.DecodedIdToken
        const { uid, email } = await this.auth.verifyIdToken(token);
        return {
          logIn: true,
          uid,
          email,
        };
      } catch (e) {
        throw new AuthenticationError(e);
      }
    }

    // If there is no token in the request header, it is an anonymous user.
    return {
      logIn: false,
      uid: 'anonymous',
    };
  }

  /**
   * Get user's name from uid
   * @param {object} param
   * @param {string} param.uid the uid of the user
   * @returns {Promise<string>} user's name of the uid
   */
  async getUserName({ uid }) {
    const { displayName } = await this.userDataloader.load({ uid });
    return displayName;
  }

  /**
   * Get user's email from uid
   * @param {object} param
   * @param {string} param.uid the uid of the user
   * @returns {Promise<string>} user's email of the uid
   */
  async getUserEmail({ uid }) {
    const { email } = await this.userDataloader.load({ uid });
    return email;
  }

  /**
   * Get user's photoURL from uid
   * @param {object} param
   * @param {string} param.uid the uid of the user
   * @returns {Promise<string>} user's photoURL of the uid
   */
  async getUserPhotoURL({ uid }) {
    const { photoURL } = await this.userDataloader.load({ uid });
    return photoURL;
  }
} // class AuthDataSource

module.exports = AuthDataSource;
