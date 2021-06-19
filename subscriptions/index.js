const { ApolloServer } = require("apollo-server");
const resolversGenerator = require("./resolversGenerator");
const typeDefs = require("./schema");
const admin = require("firebase-admin");
const port = 8333;

admin.initializeApp({
  credential: admin.credential.applicationDefault(),
});

const firestore = admin.firestore();

const resolvers = resolversGenerator(firestore);

const server = new ApolloServer({
  typeDefs,
  resolvers,
  subscriptions: {
    path: "/subscriptions",
    onConnect: (connectionParams, webSocket, context) => {
      console.log("Client connected");
    },
    onDisconnect: (webSocket, context) => {
      console.log("Client disconnected");
    },
  },
  formatError: (error) => {
    console.log(error);
    return error;
  },
  // https://github.com/apollographql/apollo-server/issues/5145
  // make the subscription result scrollable
  playground: { version: "1.7.40" },
  introspection: true,
});

server.listen({ port }).then(({ url }) => {
  console.log(
    `🚀 Subscription endpoint ready at ws://localhost:${port}${server.subscriptionsPath}`
  );
  console.log("Query at studio.apollographql.com/dev");
  console.log(url);
});
