// The Firebase Admin SDK to access the Firebase Realtime Database.
const admin = require('firebase-admin');

const apolloServer = require('./src');

const { storageBucket } = process.env;

admin.initializeApp({
  credential: admin.credential.applicationDefault(),
  storageBucket,
});

const apolloServerAdmin = apolloServer({ admin });

/**
 * Fastify v3 is not compatible with apollo server v3, and apollo server
 * v3 is in the alpha release. As a result, we use fastify v2 at this moment.
 * ref: https://github.com/apollographql/apollo-server/issues/4463#issuecomment-671590817
 *
 * When the apollo server v3 releases, we can migrate to it and update all fastify
 * to version3.
 * In apollo version3, there may be a better integration with graphql-ws. We may
 * change to it at that moment.
 */
apolloServerAdmin.listen({ port: 8080 }).then(({ url }) => {
  console.log(`🚀 Server ready at ${url}`);
  console.log(`if you are in the docker dev environment, please visit http://localhost:8333
or see the config in the docker-compose.yml`);
});
