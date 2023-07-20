const { DateTime } = require('luxon');

const logger = require('pino-caller')(require('../../logger'));

/**
 * @typedef {import('../types').ResolverArgsInfo} ResolverArgsInfo
 * @typedef {import('../types').RawTagDocumentFields} RawTagDocumentFields
 * @typedef {import('../types').RawStatusDocumentFields} RawStatusDocumentFields
 * @typedef {import('../types').PageParams} PageParams
 * @typedef {import('@google-cloud/firestore').Timestamp} Timestamp
 * @typedef {import('@google-cloud/firestore').GeoPoint} GeoPoint
 */

/**
 *
 * @param {Timestamp | string} timestamp
 * @returns
 */
function transferTimestamp(timestamp) {
  try {
    if (typeof timestamp === 'string') {
      return DateTime.fromISO(timestamp).setZone('UTC+8').toString();
    }
    if (typeof timestamp === 'object') {
      return DateTime.fromISO(timestamp.toDate().toISOString())
        .setZone('UTC+8')
        .toString();
    }
  } catch (e) {
    console.error('error: the timestamp type or format may not correct');
    console.error(e);
  }
  return null;
}

/** *** Make sure your resolvers can handle data from Pub/Sub  ***** */
const tagResolvers = {
  Tag: {
    /**
     * @param {RawTagDocumentFields} tag
     * @param {*} _
     * @param {*} __
     */
    createTime: async (tag, _, __) => transferTimestamp(tag.createTime),

    /**
     * @param {RawTagDocumentFields} tag
     * @param {*} _
     * @param {*} __
     */
    lastUpdateTime: async (tag, _, __) => transferTimestamp(tag.lastUpdateTime),
    createUser: async (tag, _, __) => ({
      uid: tag.createUserId,
    }),
    /**
     * @param {RawTagDocumentFields} tag
     * @param {*} _
     * @param {ResolverArgsInfo} info
     */
    imageUrl: async (tag, _, { dataSources }) =>
      dataSources.storageDataSource.getImageUrls({ tagId: tag.id }),
    /**
     * @param {RawTagDocumentFields} tag
     * @param {*} _
     * @param {ResolverArgsInfo} info
     */
    status: async (tag, _, { dataSources, userInfo }) =>
      dataSources.tagDataSource.getLatestStatusData({
        tagId: tag.id,
        userInfo,
      }),
    /**
     * @param {RawTagDocumentFields} tag
     * @param {{pageParams: PageParams}} params
     * @param {ResolverArgsInfo} info
     */
    statusHistory: async (tag, { pageParams }, { dataSources }) =>
      dataSources.tagDataSource.getStatusHistory({ tagId: tag.id, pageParams }),
  },
};

const statusResolvers = {
  Status: {
    /**
     * @param {RawStatusDocumentFields} status
     * @param {*} _
     * @param {ResolverArgsInfo} info
     */
    // TODO add imageurl resolver here to get the image url
    imageUrl: async (status, _, { dataSources }) => {
      const { docPath, type } = status;
      if (type === 'fixedTagSubLocation') {
        return dataSources.storageDataSource.getFixedTagSubLocationImageUrls({
          docPath,
        });
      }
      return null;
    },
    createTime: async (status, _, __) => transferTimestamp(status.createTime),
    createUser: async (status, _, __) => ({ uid: status.createUserId }),
  },
};

const userResolvers = {
  User: {
    uid: async ({ uid }, _, __) => uid,
    /**
     * @param {{uid: string}} param
     * @param {*} _
     * @param {ResolverArgsInfo} info
     */
    displayName: async ({ uid }, _, { dataSources }) =>
      dataSources.authDataSource.getUserName({ uid }),
    /**
     * @param {{uid: string}} param
     * @param {*} _
     * @param {ResolverArgsInfo} info
     */
    photoURL: async ({ uid }, _, { dataSources }) =>
      dataSources.authDataSource.getUserPhotoURL({ uid }),
    /**
     * @param {{uid: string}} param
     * @param {*} _
     * @param {ResolverArgsInfo} info
     */
    email: async ({ uid }, _, { dataSources, userInfo }) => {
      const { uid: logInUserUid, logIn } = userInfo;
      return logIn && logInUserUid === uid
        ? dataSources.authDataSource.getUserEmail({ uid })
        : null;
    },
    /**
     * @param {{uid: string}} param
     * @param {*} _
     * @param {ResolverArgsInfo} info
     */
    userAddTagNumber: async ({ uid }, _, { dataSources }) =>
      dataSources.userDataSource.getUserAddTagNumber({ uid }),
  },
};

const coordinateResolvers = {
  /**
   *
   * @param {GeoPoint | { latitude: string, longitude:string }} coordinates
   * @param {*} _
   * @param {*} __
   * @returns
   */
  Coordinate: async (coordinates, _, __) => {
    const { latitude, longitude } = coordinates;
    try {
      if (typeof latitude === 'string' && typeof longitude === 'string') {
        return { latitude, longitude };
      }
      if (typeof latitude === 'number' && typeof longitude === 'number') {
        return {
          latitude: latitude.toString(),
          longitude: longitude.toString(),
        };
      }
    } catch (e) {
      console.error('error: the coordinate type or format may not correct');
      console.error(e);
    }
    return null;
  },
};

// https://www.apollographql.com/docs/apollo-server/schema/unions-interfaces/
// in case there is type resolve using interface `Page`
// If we have type implement interface but don't define resolvers
// there would be warnings complain
const pageResolvers = {
  Page: {
    __resolveType(page, _, __) {
      if (page.tags) {
        return 'TagPage';
      }
      if (page.statusList) {
        return 'StatusPage';
      }
      if (page.fixedTags) {
        return 'FixedTagPage';
      }
      return null;
    },
  },
};

const fixedTagResolver = {
  FixedTag: {
    /**
     *
     * @param {*} fixedTag
     * @param {*} _
     * @param {ResolverArgsInfo} info
     */
    fixedTagSubLocations: async (fixedTag, _, { dataSources }) => {
      logger.debug('in resolver fixedTagSubLocations');
      return dataSources.tagDataSource.getAllfixedTagSubLocation(fixedTag.id);
    },
  },
};

// TODO: use tool to auto generate type from graphql schema
const fixedTagSubLocationStatusResolver = {
  /**
   * @param {} subLocation
   * @param {*} _
   * @param {ResolverArgsInfo} info
   */
  status: async (subLocation, _, { dataSources }) => {
    logger.debug('in resolver fixedTagSubLocationStatusResolver-> status');

    return dataSources.tagDataSource.getFixedTagSubLocationLatestStatusData({
      subLocationId: subLocation.id,
    });
  },
  /**
   * @param {} subLocation
   * @param {{pageParams: PageParams}} params
   * @param {ResolverArgsInfo} info
   */
  statusHistory: async (subLocation, { pageParams }, { dataSources }) =>
    dataSources.tagDataSource.getFixedTagSubLocationStatusHistory({
      subLocationId: subLocation.id,
      pageParams,
    }),
};

const fixedTagSubLocationResolvers = {
  FixedTagSubLocation: {
    __resolveType(subLocation, _, __) {
      logger.debug(subLocation);
      if (
        subLocation.type === 'restaurant-store' ||
        subLocation.type === 'sports'
      ) {
        return 'FixedTagPlace';
      }
      if (subLocation.type === 'floor') {
        return 'FixedTagFloor';
      }
      return null;
    },
  },
  FixedTagPlace: {
    ...fixedTagSubLocationStatusResolver,
  },
  FixedTagFloor: {
    ...fixedTagSubLocationStatusResolver,
  },
};

// for research
const tagResearchResolvers = {
  TagResearch: {
    /**
     * @param {RawTagDocumentFields} tag
     * @param {*} _
     * @param {*} __
     */
    createTime: async (tag, _, __) => transferTimestamp(tag.createTime),

    /**
     * @param {RawTagDocumentFields} tag
     * @param {*} _
     * @param {*} __
     */
    lastUpdateTime: async (tag, _, __) => transferTimestamp(tag.lastUpdateTime),
    createUser: async (tag, _, __) => ({
      uid: tag.createUserId,
    }),
    /**
     * @param {RawTagDocumentFields} tag
     * @param {*} _
     * @param {ResolverArgsInfo} info
     */
    imageUrl: async (tag, _, { dataSources }) =>
      dataSources.storageDataSource.getImageUrls({ tagId: tag.id }),
    /**
     * @param {RawTagDocumentFields} tag
     * @param {*} _
     * @param {ResolverArgsInfo} info
     */
    status: async (tag, _, { dataSources, userInfo }) =>
      dataSources.tagResearchDataSource.getLatestStatusData({
        tagId: tag.id,
        userInfo,
      }),
    /**
     * @param {RawTagDocumentFields} tag
     * @param {{pageParams: PageParams}} params
     * @param {ResolverArgsInfo} info
     */
    statusHistory: async (tag, { pageParams }, { dataSources }) =>
      dataSources.tagResearchDataSource.getStatusHistory({
        tagId: tag.id,
        pageParams,
      }),
  },
};

const statusResearchResolvers = {
  StatusResearch: {
    /**
     * @param {RawStatusDocumentFields} status
     * @param {*} _
     * @param {ResolverArgsInfo} info
     */
    // TODO add imageurl resolver here to get the image url
    imageUrl: async () => null,
    createTime: async (status, _, __) => transferTimestamp(status.createTime),
    createUser: async (status, _, __) => ({ uid: status.createUserId }),
  },
};

const userResearchResolvers = {
  UserResearch: {
    uid: async ({ uid }, _, __) => uid,
    /**
     * @param {{uid: string}} param
     * @param {*} _
     * @param {ResolverArgsInfo} info
     */
    displayName: async ({ uid }, _, { dataSources }) =>
      dataSources.authDataSource.getUserName({ uid }),
    /**
     * @param {{uid: string}} param
     * @param {*} _
     * @param {ResolverArgsInfo} info
     */
    photoURL: async ({ uid }, _, { dataSources }) =>
      dataSources.authDataSource.getUserPhotoURL({ uid }),
    /**
     * @param {{uid: string}} param
     * @param {*} _
     * @param {ResolverArgsInfo} info
     */
    email: async ({ uid }, _, { dataSources, userInfo }) => {
      const { uid: logInUserUid, logIn } = userInfo;
      return logIn && logInUserUid === uid
        ? dataSources.authDataSource.getUserEmail({ uid })
        : null;
    },
  },
};

const coordinateResearchResolvers = {
  /**
   *
   * @param {GeoPoint | { latitude: string, longitude:string }} coordinates
   * @param {*} _
   * @param {*} __
   * @returns
   */
  CoordinateResearch: async (coordinates, _, __) => {
    const { latitude, longitude } = coordinates;
    try {
      if (typeof latitude === 'string' && typeof longitude === 'string') {
        return { latitude, longitude };
      }
      if (typeof latitude === 'number' && typeof longitude === 'number') {
        return {
          latitude: latitude.toString(),
          longitude: longitude.toString(),
        };
      }
    } catch (e) {
      console.error('error: the coordinate type or format may not correct');
      console.error(e);
    }
    return null;
  },
};

module.exports = {
  tagResolvers,
  statusResolvers,
  userResolvers,
  coordinateResolvers,
  pageResolvers,
  fixedTagResolver,
  fixedTagSubLocationResolvers,
  tagResearchResolvers,
  statusResearchResolvers,
  userResearchResolvers,
  coordinateResearchResolvers,
};
