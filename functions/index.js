// The Cloud Functions for Firebase SDK to create Cloud Functions and setup triggers.
const functions = require('firebase-functions');

// The Firebase Admin SDK to access the Firebase Realtime Database.
const admin = require('firebase-admin');

admin.initializeApp();

const express = require('express');
const { express: voyagerMiddleware } = require('graphql-voyager/middleware');
const apolloServer = require('./src');
const uploadImageProcessing = require('./utils/uploadImageProcessing');

// console.log('hello');
// console.log(process.env);

const apolloServerApp = express();
const apolloServerAdmin = apolloServer({ admin });

apolloServerAdmin.applyMiddleware({ app: apolloServerApp, path: '/' });

const voyagerApp = express();

// vaoyager will ues `endpointUrl` to get schema
// make sure its path is where the scehema locate
// use in local emulator
// app.use('/voyager', voyagerMiddleware({ endpointUrl: '/smartcampus-1b31f/us-central1/graphql/graphql' }));

// use in production
voyagerApp.use('/', voyagerMiddleware({ endpointUrl: '/graphql' }));

exports.graphql = functions.https.onRequest(apolloServerApp);
exports.voyager = functions.https.onRequest(voyagerApp);
exports.uploadImageProcessing = functions.storage
  .object()
  .onFinalize(async object => {
    await uploadImageProcessing(admin, object);
  });
