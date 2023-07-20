const logger = require('pino-caller')(require('../../logger'));

const {
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
} = require('./map_resolvers');

/**
 * @typedef {import('../types').ResolverArgsInfo} ResolverArgsInfo
 * @typedef {import('../types').AddTagDataInput} AddTagDataInput
 * @typedef {import('../types').UpdateTagDataInput} UpdateTagDataInput
 * @typedef {import('../types').PageParams} PageParams
 * @typedef {import(../CampusPubSub)} PubSub
 */

const queryResolvers = {
  Query: {
    /**
     * @param {*} _
     * @param {{pageParams: PageParams}} params
     * @param {ResolverArgsInfo} info
     */
    unarchivedTagList: async (_, { pageParams }, { dataSources, userInfo }) => {
      const data = await dataSources.tagDataSource.getAllUnarchivedTags(
        pageParams
      );
      // Record user activity after the above function successfully return with
      // no errors.
      await dataSources.tagDataSource.recordUserActivity('getTags', userInfo);
      return data;
    },
    /**
     * @param {*} _
     * @param {{tagId: string}} params
     * @param {ResolverArgsInfo} info
     */
    tag: async (_, { tagId }, { dataSources }) =>
      dataSources.tagDataSource.getTagData({ tagId }),
    /**
     *
     * @param {*} _
     * @param {{pageParams: PageParams}} params
     * @param {ResolverArgsInfo} info
     * @returns
     */
    fixedTagList: async (_, { pageParams }, { dataSources, userInfo }) =>
      dataSources.tagDataSource.getAllFixedTags(pageParams, userInfo),
    /**
     *
     * @param {*} _
     * @param {{fixedTagTd: string}} params
     * @param {ResolverArgsInfo} info
     * @returns
     */
    fixedTag: async (_, { fixedTagId }, { dataSources }) =>
      dataSources.tagDataSource.getFixedTagData({ fixedTagId }),
    /**
     *
     * @param {*} _
     * @param {{fixedTagSubLocationId: string}} params
     * @param {ResolverArgsInfo} info
     * @returns
     */
    fixedTagSubLocation: async (
      _,
      { fixedTagSubLocationId },
      { dataSources }
    ) =>
      dataSources.tagDataSource.getFixedTagSubLocationData({
        fixedTagSubLocationId,
      }),
    /**
     * @param {*} _
     * @param {{uid: string, pageParams: PageParams}} params
     * @param {ResolverArgsInfo} info
     */
    userAddTagHistory: async (_, { uid, pageParams }, { dataSources }) =>
      dataSources.tagDataSource.getUserAddTagHistory({ uid, pageParams }),
    /**
     * @param {*} _
     * @param {*} __
     * @param {ResolverArgsInfo} info
     */
    hasReadGuide: async (_, __, { dataSources, userInfo }) =>
      dataSources.userDataSource.getHasReadGuideStatus({ userInfo }),
    /**
     * @param {*} _
     * @param {*} __
     * @param {ResolverArgsInfo} info
     */
    archivedThreshold: async (_, __, { dataSources }) =>
      dataSources.tagDataSource.archivedThreshold,
    /**
     *
     * @param {*} _
     * @param {{uid: string}} param
     * @param {*} __
     * @returns
     */
    getUserData: async (_, { uid }, __) => ({ uid }),
    // for research
    tagResearch: async (_, { tagId }, { dataSources }) =>
      dataSources.tagResearchDataSource.getTagResearchData({ tagId }),
  },
};

const mutationResolvers = {
  Mutation: {
    /**
     * @param {*} _
     * @param {{data: AddTagDataInput}} param
     * @param {ResolverArgsInfo} info
     */
    addNewTagData: async (_, { data }, { dataSources, userInfo }) => {
      const { tag, imageUploadNumber } =
        await dataSources.tagDataSource.addNewTagData({ data, userInfo });
      const imageUploadUrls = Promise.all(
        dataSources.storageDataSource.getImageUploadUrls({
          imageUploadNumber,
          // Deprecate in the future. This is for the old version support.
          firestorePath: tag.id,
        })
      );

      // increment userAddTagNumber
      const { uid } = userInfo;
      await dataSources.userDataSource.updateUserAddTagNumber({
        uid,
        action: 'increment',
      });
      // event: added
      await dataSources.tagDataSource.triggerEvent('added', tag);

      // Record user activity after the above function successfully return with
      // no errors.
      await dataSources.tagDataSource.recordUserActivity(
        'addTag',
        userInfo,
        tag.id
      );
      return { tag, imageUploadNumber, imageUploadUrls };
    },

    addNewTagResearchData: async (_, { data }, { dataSources, userInfo }) => {
      const { tag, imageUploadNumber } =
        await dataSources.tagResearchDataSource.addNewTagResearchData({
          data,
          userInfo,
        });

      const imageUploadUrls = await Promise.all(
        dataSources.storageDataSource.getImageUploadUrls({
          imageUploadNumber,
          // Deprecate in the future. This is for the old version support.
          firestorePath: tag.id,
        })
      );

      // event: added
      await dataSources.tagResearchDataSource.triggerEvent('added', tag);

      // Record user activity after the above function successfully return with
      // no errors.
      await dataSources.tagResearchDataSource.recordUserActivity(
        'addTag',
        userInfo,
        tag.id
      );

      return { tagResearch: tag, imageUploadNumber, imageUploadUrls };
    },
    /**
     *
     * @param {*} _
     * @param {{tagId: string, data: UpdateTagDataInput}} param
     * @param {ResolverArgsInfo} info
     */
    updateTagData: async (_, { tagId, data }, { dataSources, userInfo }) => {
      const { imageDeleteUrls, imageUploadNumber = 0 } = data;
      const { tag } = await dataSources.tagDataSource.updateTagData({
        tagId,
        data,
        userInfo,
      });
      // event: updated
      await dataSources.tagDataSource.triggerEvent('updated', tag);

      // Record user activity after the above function successfully return with
      // no errors.
      await dataSources.tagDataSource.recordUserActivity(
        'updateTag',
        userInfo,
        tagId
      );

      return {
        tag,
        imageUploadNumber,
        imageUploadUrls: await dataSources.storageDataSource.getImageUploadUrls(
          // Deprecate in the future. This is for the old version support.
          { imageUploadNumber, firestorePath: tagId }
        ),
        imageDeleteStatus: await dataSources.storageDataSource.doImageDelete(
          tagId,
          imageDeleteUrls
        ),
      };
    },
    /**
     *
     * @param {*} _
     * @param {{tagId: string, statusName: string, description: string }} param
     * @param {ResolverArgsInfo} info
     * @returns
     */
    updateTagStatus: async (
      _,
      { tagId, statusName, description },
      { dataSources, userInfo }
    ) => {
      const updatedStatus = dataSources.tagDataSource.updateTagStatus({
        tagId,
        statusName,
        description,
        userInfo,
      });
      // event: updated
      const tag = dataSources.tagDataSource.getTagData({ tagId });
      await dataSources.tagDataSource.triggerEvent('updated', tag);

      // Record user activity after the above function successfully return with
      // no errors.
      await dataSources.tagDataSource.recordUserActivity(
        'updateStatus',
        userInfo,
        tagId
      );

      return updatedStatus;
    },
    /**
     *
     * @param {*} _
     * @param {{tagId: string, statusName: string, description: string, hasNumberOfUpVote: string}} param
     * @param {ResolverArgsInfo} info
     * @returns
     */
    updateFixedTagSubLocationStatus: async (
      _,
      { fixedTagSubLocationId, statusName, description, imageUploadNumber },
      { dataSources, userInfo }
    ) => {
      const updatedStatus =
        await dataSources.tagDataSource.updateFixedTagSubLocationStatus({
          FixedTagSubLocationId: fixedTagSubLocationId,
          statusName,
          description,
          userInfo,
        });

      let imageUploadUrls;
      try {
        imageUploadUrls = await Promise.all(
          dataSources.storageDataSource.getImageUploadUrls({
            imageUploadNumber,
            firestorePath: updatedStatus.docPath,
          })
        );
      } catch (error) {
        logger.error('error when create signed url');
        logger.error(error);
      }

      // Record user activity after the above function successfully return with
      // no errors.
      await dataSources.tagDataSource.recordUserActivity(
        'updateFixedTagStatus',
        userInfo,
        fixedTagSubLocationId
      );

      return { status: updatedStatus, imageUploadNumber, imageUploadUrls };
    },
    /**
     *
     * @param {*} _
     * @param {{tagId: string, action: string}} param
     * @param {ResolverArgsInfo} info
     */
    updateUpVoteStatus: async (
      _,
      { tagId, action },
      { dataSources, userInfo }
    ) => {
      const data = await dataSources.tagDataSource.updateNumberOfUpVote({
        tagId,
        action,
        userInfo,
      });

      // Record user activity after the above function successfully return with
      // no errors.
      await dataSources.tagDataSource.recordUserActivity(
        action,
        userInfo,
        tagId
      );
      return data;
    },

    /**
     *
     * @param {*} _
     * @param {{tagId: string}} param
     * @param {ResolverArgsInfo} info
     * @returns
     */
    deleteTagDataByCreateUser: async (
      _,
      { tagId },
      { dataSources, userInfo }
    ) =>
      dataSources.tagDataSource.deleteTagDataByCreateUser({ tagId, userInfo }),
    /**
     *
     * @param {*} _
     * @param {*} __
     * @param {ResolverArgsInfo} info
     */
    setHasReadGuide: async (_, __, { dataSources, userInfo }) =>
      dataSources.userDataSource.setHasReadGuide({ userInfo }),
    /**
     * @param {*} _
     * @param {{tagId: string}} string
     * @param {ResolverArgsInfo} info
     */
    incrementViewCount: async (_, { tagId }, { dataSources, userInfo }) => {
      const data = await dataSources.tagDataSource.incrementTagViewCount(
        tagId,
        userInfo
      );

      // Record user activity after the above function successfully return with
      // no errors.
      await dataSources.tagDataSource.recordUserActivity(
        'viewTag',
        userInfo,
        tagId
      );

      return data;
    },
  },
};

const subscriptionResolvers = {
  Subscription: {
    archivedThreshold: {
      subscribe: (_, __, { pubsub }) =>
        pubsub.asyncIterator(['archivedThreshold_change']),
    },
    tagChangeSubscription: {
      /**
       * Subscribe to the events occured after the unix timestamp (millseconds)
       * @param {*} _
       * @param {*} __
       * @param {{pubsub: PubSub}}
       * @returns
       */
      subscribe: (_, __, { pubsub }) =>
        pubsub.asyncIterator(['tagChangeSubscription']),
    },
  },
};

const resolvers = {
  ...queryResolvers,
  ...mutationResolvers,
  ...subscriptionResolvers,
  ...tagResolvers,
  ...statusResolvers,
  ...userResolvers,
  ...coordinateResolvers,
  ...pageResolvers,
  ...fixedTagResolver,
  ...fixedTagSubLocationResolvers,
  ...tagResearchResolvers,
  ...statusResearchResolvers,
  ...userResearchResolvers,
  ...coordinateResearchResolvers,
};

module.exports = resolvers;
