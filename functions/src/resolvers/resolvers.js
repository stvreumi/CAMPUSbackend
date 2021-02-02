const { merge } = require('lodash');

const {
  tagResolvers,
  statusResolvers,
  userResolvers,
  coordinateResolvers,
} = require('./map_resolvers');

const queryResolvers = {
  Query: {
    tagRenderList: async (_, __, { dataSources }) =>
      dataSources.firebaseAPI.getAllTags(),
    tag: async (_, { id }, { dataSources }) =>
      dataSources.firebaseAPI.getTagData({ id }),
    userAddTagHistory: async (_, { uid }, { dataSources }) =>
      dataSources.firebaseAPI.getUserAddTagHistory({ uid }),
    intentAnswer: async (_, { intent }, { dataSources }) =>
      dataSources.firebaseAPI.getAnswer(intent),
    hasReadGuide: async (_, __, { dataSources, userInfo }) =>
      dataSources.firebaseAPI.getHasReadGuideStatus({ userInfo }),
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
    addNewIntent: (_, { userIntent, userAnswer }, { dataSources }) =>
      dataSources.firebaseAPI.addNewIntent({ userIntent, userAnswer }),
    updateUpVoteStatus: async (
      _,
      { tagId, action },
      { dataSources, userInfo }
    ) =>
      dataSources.firebaseAPI.updateNumberOfUpVote({ tagId, action, userInfo }),
    setHasReadGuide: async (_, __, { dataSources, userInfo }) =>
      dataSources.firebaseAPI.setHasReadGuide({ userInfo }),
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
