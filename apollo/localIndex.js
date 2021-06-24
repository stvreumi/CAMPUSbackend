// The Firebase Admin SDK to access the Firebase Realtime Database.
const admin = require('firebase-admin');
const express = require('express');
const { express: voyagerMiddleware } = require('graphql-voyager/middleware');

const apolloServer = require('./src');

admin.initializeApp({
  credential: admin.credential.applicationDefault(),
  storageBucket: 'gs://smartcampus-1b31f.appspot.com',
});

const app = express();

// Start our server if we're not in a test env.
// if we're in a test env, we'll manually start it in a test
if (process.env.NODE_ENV !== 'test') {
  const server = apolloServer({ admin });
  app.use('/voyager', voyagerMiddleware({ endpointUrl: '/' }));
  server.applyMiddleware({ app, path: '/' });
  app.listen({ port: 4001 }, () => console.log('app running at port 4001'));
}
