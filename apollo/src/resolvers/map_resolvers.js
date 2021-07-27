//@ts-check
const { DateTime } = require('luxon');

/**
 * @typedef {import('../types').ResolverArgsInfo} ResolverArgsInfo
 * @typedef {import('../types').RawTagDocumentFields} RawTagDocumentFields
 * @typedef {import('../types').RawStatusDocumentFields} RawStatusDocumentFields
 * @typedef {import('../types').PageParams} PageParams
 */

const tagResolvers = {
  Tag: {
    /**
     * @param {RawTagDocumentFields} tag
     * @param {*} _
     * @param {*} __
     */
    createTime: async (tag, _, __) =>
      tag.createTime
        ? DateTime.fromISO(tag.createTime.toDate().toISOString())
            .setZone('UTC+8')
            .toString()
        : null,
    /**
     * @param {RawTagDocumentFields} tag
     * @param {*} _
     * @param {*} __
     */
    lastUpdateTime: async (tag, _, __) =>
      tag.lastUpdateTime
        ? DateTime.fromISO(tag.lastUpdateTime.toDate().toISOString())
            .setZone('UTC+8')
            .toString()
        : null,
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
     * @param {Status} RawStatusDocumentFields
     * @param {*} _
     * @param {*} __
     */
    createTime: async (status, _, __) =>
      DateTime.fromISO(status.createTime.toDate().toISOString())
        .setZone('UTC+8')
        .toString(),
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
    email: async ({ uid }, __, { dataSources, userInfo }) => {
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
  Coordinate: {
    latitude: async (coordinates, _, __) =>
      coordinates ? coordinates.latitude.toString() : null,
    longitude: async (coordinates, _, __) =>
      coordinates ? coordinates.longitude.toString() : null,
  },
};

const pageResolvers = {
  Page: {
    __resolveType(page, _, __) {
      if (page.tags) {
        return 'TagPage';
      }
      if (page.statusList) {
        return 'StatusPage';
      }
      return null;
    },
  },
};

module.exports = {
  tagResolvers,
  statusResolvers,
  userResolvers,
  coordinateResolvers,
  pageResolvers,
};
