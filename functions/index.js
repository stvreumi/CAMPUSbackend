// The Cloud Functions for Firebase SDK to create Cloud Functions and setup triggers.
const functions = require("firebase-functions");

// The Firebase Admin SDK to access the Firebase Realtime Database.
// https://firebase.google.com/docs/firestore/quickstart#initialize
// * The initialize method described in the docs may only limited to ES module import
const admin = require("firebase-admin");

const uploadImageProcessingImplementation = require("./functionTriggers/uploadImageProcessing");
const deleteTagTriggerImplementation = require("./functionTriggers/deleteTagTrigger");
const exportUserActivitiesToJsonImplementation = require("./functionTriggers/exportUserActivitiesToJson");

admin.initializeApp();
const firestore = admin.firestore();

exports.uploadImageProcessing = functions.storage
  .object()
  .onFinalize(async (object) =>
    uploadImageProcessingImplementation(admin, object)
  );
exports.deleteTagTrigger = functions.firestore
  .document("tagData/{tagId}")
  .onDelete(async (snap, _) => {
    await deleteTagTriggerImplementation(admin, snap);
  });

// * schedule format reference: https://cloud.google.com/appengine/docs/standard/python/config/cronref#schedule_format
// * schedule function: https://firebase.google.com/docs/functions/schedule-functions
// * firebase emulator doesn't support it currently
//   https://github.com/firebase/firebase-tools/issues/2034

exports.exportUserActivitiesToJson = functions.pubsub
  .schedule("every 36 hours") // 3 days
  .onRun(async () => {
    exportUserActivitiesToJsonImplementation(firestore);
  });

// use below script to test
// exports.test = functions.https.onRequest()
