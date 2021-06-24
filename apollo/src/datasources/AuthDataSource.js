/** @module AuthDataSource */
const { DataSource } = require('apollo-datasource');
const { AuthenticationError } = require('apollo-server-express');

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
  async getUserInfoFromToken(authorization) {
    if (authorization) {
      const token = authorization.replace('Bearer ', '');
      try {
        // verifyIdToken return DecodedIdToken
        // https://firebase.google.com/docs/reference/admin/node/admin.auth.DecodedIdToken
        const { uid, email } = await this.auth.verifyIdToken(token);
        // getUser return UserRecord
        // https://firebase.google.com/docs/reference/admin/node/admin.auth.UserRecord
        const { displayName } = await this.auth.getUser(uid);
        return {
          logIn: true,
          uid,
          email,
          displayName: displayName || uid,
        };
      } catch (e) {
        throw new AuthenticationError(e);
      }
    }

    // If there is no token in the request header, it is an anonymous user.
    return {
      logIn: false,
      uid: 'anonymous',
      displayName: 'anonymous',
    };
  }

  /**
   * Get user's name from uid
   * @param {object} param
   * @param {string} param.uid the uid of the user
   * @returns {Promise<string>} user's name of the uid
   */
  async getUserName({ uid }) {
    try {
      const { displayName } = await this.auth.getUser(uid);
      return displayName;
    } catch (error) {
      throw new Error(`Error fetching user data: ${error}`);
    }
  }

  /**
   * Get user's email from uid
   * @param {object} param
   * @param {string} param.uid the uid of the user
   * @returns {Promise<string>} user's email of the uid
   */
  async getUserEmail({ uid }) {
    try {
      const { email } = await this.auth.getUser(uid);
      return email;
    } catch (error) {
      throw new Error(`Error fetching user data: ${error}`);
    }
  }
} // class AuthDataSource

module.exports = AuthDataSource;
