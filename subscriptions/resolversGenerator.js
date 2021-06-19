const { DateTime } = require('luxon');
const CampusPubSub = require("./CampusPubSub");

function resolversGenerator(firestore) {
  const pubsub = new CampusPubSub(firestore);
  return {
    Query: {
      serverName: async () => "Campus graphql subscription server",
    },
    Subscription: {
      archivedThreshold: {
        subscribe: () => pubsub.asyncIterator(["archivedThreshold_change"]),
      },
      tagChangeSubscription: {
        subscribe: (_, { subAfter }, __) => {
          // TODO
          // It seems that we don't need to add timestamp. When the client
          // connect and subscribe, it just receive the event happended after that.
          // So the client should create connection to subscription before query
          // to prevent when there is event occured in the query time?
          // Still needed, or the snapshot would return every tags on every connection
          // may need to rewrite the async iterator
          // Write this comment to the notion.
          // add a regex in the pubsub subscribe function, and add to the subscriptions
          // using the event name
          return pubsub.asyncIterator([`tagChangeSubscription_${subAfter}`]);
        },
      },
    },
    TagFieldsForSubscription: {
      lastUpdateTime: async (rawTagDocumentData, _, __) =>
        DateTime.fromISO(rawTagDocumentData.lastUpdateTime.toDate().toISOString())
          .setZone("UTC+8")
          .toString(),
    },
    Coordinate: {
      latitude: async (coordinates, _, __) => coordinates.latitude.toString(),
      longitude: async (coordinates, _, __) => coordinates.longitude.toString(),
    },
  };
}

module.exports = resolversGenerator;
