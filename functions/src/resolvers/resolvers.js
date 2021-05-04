const { merge } = require('lodash');

const {
  tagResolvers,
  statusResolvers,
  userResolvers,
  coordinateResolvers,
} = require('./map_resolvers');

/** @typedef {import('../types').ResolverArgsInfo} ResolverArgsInfo */

const queryResolvers = {
  Query: {
    /**
     * @param {*} _
     * @param {*} __
     * @param {ResolverArgsInfo} info
     */
    unarchivedTagList: async (_, __, { dataSources }) =>
      dataSources.firebaseAPI.getAllUnarchivedTags(),
    /**
     * @param {*} _
     * @param {{tagId: string}} params
     * @param {ResolverArgsInfo} info
     */
    tag: async (_, { tagId }, { dataSources }) =>
      dataSources.firebaseAPI.getTagData({ tagId }),
    /**
     * @param {*} _
     * @param {{uid: string}} params
     * @param {ResolverArgsInfo} info
     */
    userAddTagHistory: async (_, { uid }, { dataSources }) =>
      dataSources.firebaseAPI.getUserAddTagHistory({ uid }),
    /**
     * @param {*} _
     * @param {*} __
     * @param {ResolverArgsInfo} info
     */
    hasReadGuide: async (_, __, { dataSources, userInfo }) =>
      dataSources.firebaseAPI.getHasReadGuideStatus({ userInfo }),
    /**
     * @param {*} _
     * @param {*} __
     * @param {ResolverArgsInfo} info
     */
    archivedThreshold: async (_, __, { dataSources }) =>
      dataSources.firebaseAPI.getArchivedThresholdOfNumberOfUpVote(),
  },
};

const mutationResolvers = {
  Mutation: {
    addNewTagData: async (_, { data }, { dataSources, userInfo }) =>
      dataSources.firebaseAPI.addNewTagData({ data, userInfo }),
    updateTagData: async (_, { tagId, data }, { dataSources, userInfo }) =>
      dataSources.firebaseAPI.updateTagData({ tagId, data, userInfo }),
    updateTagStatus: async (
      _,
      { tagId, statusName, description },
      { dataSources, userInfo }
    ) =>
      dataSources.firebaseAPI.updateTagStatus({
        tagId,
        statusName,
        description,
        userInfo,
      }),
    updateUpVoteStatus: async (
      _,
      { tagId, action },
      { dataSources, userInfo }
    ) =>
      dataSources.firebaseAPI.updateNumberOfUpVote({ tagId, action, userInfo }),
    setHasReadGuide: async (_, __, { dataSources, userInfo }) =>
      dataSources.firebaseAPI.setHasReadGuide({ userInfo }),
    /**
     * @param {*} _
     * @param {{tagId: string}} string
     * @param {ResolverArgsInfo} info
     */
    incrementViewCount: async (_, { tagId }, { dataSources, userInfo }) =>
      dataSources.firebaseAPI.incrementTagViewCount(tagId, userInfo),
  },
};

const resolvers = merge(
  queryResolvers,
  mutationResolvers,
  tagResolvers,
  statusResolvers,
  userResolvers,
  coordinateResolvers
);

module.exports = resolvers;
