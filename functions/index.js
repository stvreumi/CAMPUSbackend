// The Cloud Functions for Firebase SDK to create Cloud Functions and setup triggers.
const functions = require("firebase-functions");

// The Firebase Admin SDK to access the Firebase Realtime Database.
const admin = require("firebase-admin");

const uploadImageProcessingImplementation = require("./functionTriggers/uploadImageProcessing");
const deleteTagTriggerImplementation = require("./functionTriggers/deleteTagTrigger");

admin.initializeApp();

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
