/** @module authorization */
/**
 * WARNING: this files are not imported by any other files. May delete in the 
 * future.
 */
import { ForbiddenError } from 'apollo-server';

import { skip } from 'graphql-resolvers';

/**
 * A resover. Check if user is authorized.
 * Use `combineResolvers` in `graphql-resolvers` to combine
 * with other resolvers.
 * `combineResolvers`: combine a sequence of resolver.
 * If it return `skip`(`undefined`), go to next resolver.
 * Otherwise, the resolver return and ignore all the other resolvers.
 * @returns {undefined|ForbiddenError} skip, go to executute next resolvers.
 * If not login, return ForbiddenError forbid not login users
 */
export const isAuthenticated = (_, __, { me }) =>
  me ? skip : new ForbiddenError('User is not login');

/**
 * A resover. If user want to modify the tag, check if user is the tag Owner.
 * Use `combineResolvers` in `graphql-resolvers` to combine
 * with other resolvers.
 * `combineResolvers`: combine a sequence of resolver.
 * If it return `skip`(`undefined`), go to next resolver.
 * Otherwise, the resolver return and ignore all the other resolvers.
 * @returns {undefined} skip, go to executute next resolvers
 * @throws {ForbiddenError} forbid not authorize users
 */
export const isTagOwner = (_, { data }, { me, dataSources }) => {
  if (data.modify) {
    const { createUser } = dataSources.firestoreAPI.getTagCreateUser({
      tagID: data.id,
    });
    if (createUser !== me.uid) {
      const errMsg = 'Can not change the tag. Not authenticated as owner';
      throw new ForbiddenError(errMsg);
    }
  }
  return skip;
};
