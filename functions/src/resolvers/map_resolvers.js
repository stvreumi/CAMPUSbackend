//@ts-check
const tagResolvers = {
  Tag: {
    createTime: async (tag, _, __) => tag.createTime.toDate().toString(),
    lastUpdateTime: async (tag, _, __) =>
      tag.lastUpdateTime.toDate().toString(),
    createUser: async (tag, _, __) => ({
      uid: tag.createUserId,
    }),
    imageUrl: async (tag, _, { dataSources }) =>
      dataSources.firebaseAPI.getImageUrls({ tagId: tag.id }),
    status: async (tag, _, { dataSources, userInfo }) =>
      dataSources.firebaseAPI.getLatestStatusData({ tagId: tag.id, userInfo }),
    statusHistory: async (tag, _, { dataSources }) =>
      dataSources.firebaseAPI.getStatusHistory({ tagId: tag.id }),
  },
};

const statusResolvers = {
  Status: {
    createTime: async (status, _, __) => status.createTime.toDate().toString(),
    createUser: async (status, _, __) => ({ uid: status.createUserId }),
  },
};

const userResolvers = {
  User: {
    uid: async ({ uid }, _, __) => uid,
    displayName: async ({ uid }, _, { dataSources }) =>
      dataSources.firebaseAPI.getUserName({
        uid,
      }),
    email: async ({ uid }, _, { dataSources }) =>
      dataSources.firebaseAPI.getUserEmail({ uid }),
  },
};

const coordinateResolvers = {
  Coordinate: {
    latitude: async (coordinates, _, __) => coordinates.latitude.toString(),
    longitude: async (coordinates, _, __) => coordinates.longitude.toString(),
  },
};

module.exports = {
  tagResolvers,
  statusResolvers,
  userResolvers,
  coordinateResolvers,
};
