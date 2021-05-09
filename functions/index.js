// The Cloud Functions for Firebase SDK to create Cloud Functions and setup triggers.
const functions = require('firebase-functions');

// The Firebase Admin SDK to access the Firebase Realtime Database.
const admin = require('firebase-admin');

const express = require('express');
const { express: voyagerMiddleware } = require('graphql-voyager/middleware');
const apolloServer = require('./src');
const uploadImageProcessingImplementation = require('./functionTriggers/uploadImageProcessing');
const deleteImagesTriggerImplementation = require('./functionTriggers/deleteImagesTrigger');

admin.initializeApp();

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

/** firebase function endpoints */

const graphql = functions.https.onRequest(apolloServerApp);
const voyager = functions.https.onRequest(voyagerApp);
const uploadImageProcessing = functions.storage
  .object()
  .onFinalize(async object => {
    await uploadImageProcessingImplementation(admin, object);
  });
const deleteImagesTrigger = functions.firestore
  .document('tagData/{tagId}')
  .onDelete(async (snap, _) => {
    await deleteImagesTriggerImplementation(admin, snap);
  });

exports = { graphql, voyager, uploadImageProcessing, deleteImagesTrigger };
