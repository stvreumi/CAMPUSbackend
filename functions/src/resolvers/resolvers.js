const { merge } = require('lodash');

const {
  tagResolvers,
  statusResolvers,
  userResolvers,
  missionResolver,
  discoveryResolvers,
  coordinateResolvers,
} = require('./map_resolvers');

const queryResolvers = {
  Query: {
    tagRenderList: async (_, __, { dataSources }) =>
      dataSources.firebaseAPI.getTagList(),
    tag: async (_, { id }, { dataSources }) =>
      dataSources.firebaseAPI.getTagData({ id }),
    userAddTagHistory: async (_, { uid }, { dataSources }) =>
      dataSources.firebaseAPI.getUserAddTagHistory({ uid }),
    missionList: async (_, __, { dataSources }) =>
      dataSources.firebaseAPI.getList('missionList'),
    discoveryList: async (_, __, { dataSources }) =>
      dataSources.firebaseAPI.getList('discoveryList'),
    intentAnswer: async (_, { intent }, { dataSources }) =>
      dataSources.firebaseAPI.getAnswer(intent),
  },
};

const mutationResolvers = {
  Mutation: {
    addNewTagData: async (_, { data }, { dataSources, userInfo }) => {
      return dataSources.firebaseAPI.addNewTagData({ data, userInfo });
    },
    updateTagStatus: async (_, { tagId, statusName }, { dataSources }) => {
      return dataSources.firebaseAPI.updateTagStatus({ tagId, statusName });
    },
    addNewIntent: (_, { userIntent, userAnswer }, { dataSources }) => {
      return dataSources.firebaseAPI.addNewIntent({ userIntent, userAnswer });
    },
  },
};

const resolvers = merge(
  queryResolvers,
  mutationResolvers,
  tagResolvers,
  statusResolvers,
  userResolvers,
  missionResolver,
  discoveryResolvers,
  coordinateResolvers
);

module.exports = resolvers;
