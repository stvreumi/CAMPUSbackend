module.exports = {
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
  },
  Mutation: {
    addNewTagData: async (_, { data }, { dataSources, userInfo }) => {
      return dataSources.firebaseAPI.addNewTagData({ data, userInfo });
    },
    updateTagStatus: async (_, { tagId, statusName }, { dataSources }) => {
      return dataSources.firebaseAPI.updateTagStatus({ tagId, statusName });
    },
  },
  Tag: {
    createTime: async (tag, _, __) => tag.createTime.toDate().toString(),
    lastUpdateTime: async (tag, _, __) =>
      tag.lastUpdateTime.toDate().toString(),
    createUser: async (tag, _, __) => ({ uid: tag.createUserID }),
    imageUrl: async (tag, _, { dataSources }) =>
      dataSources.firebaseAPI.getImageUrls({ tagID: tag.id }),
    statusHistory: async (tag, _, { dataSources }) =>
      dataSources.firebaseAPI.getStatusHistory({ tagID: tag.id }),
  },
  Status: {
    createTime: async (status, _, __) => status.createTime.toDate().toString(),
  },
  User: {
    uid: async ({ uid }, _, __) => uid,
    displayName: async ({ uid }, _, { dataSources }) =>
      dataSources.firebaseAPI.getUserName({ uid }),
  },
  Mission: {
    discoveries: async (mission, _, { dataSources }) =>
      dataSources.firebaseAPI.getDiscoveriesOfAMission({
        missionID: mission.id,
      }),
  },
  Discovery: {
    mission: async (discovery, _, { dataSources }) =>
      dataSources.firebaseAPI.getMissionById({ id: discovery.missionID }),
  },
  Coordinate: {
    latitude: async (coordinates, _, __) => coordinates.latitude.toString(),
    longitude: async (coordinates, _, __) => coordinates.longitude.toString(),
  },
};
