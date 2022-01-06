const { FieldValue } = require("firebase-admin").firestore;
const functions = require("firebase-functions");
const { DateTime } = require("luxon");
const path = require("path");
const os = require("os");
const fs = require("fs/promises");

// require for logger
// https://firebase.google.com/docs/functions/writing-and-viewing-logs
const { logger } = require("firebase-functions");
const { PubSub } = require("@google-cloud/pubsub");

/**
 * @typedef {import('firebase-admin')} firebaseAdmin
 * @typedef {import('firebase-admin').firestore.QueryDocumentSnapshot} QueryDocumentSnapshot
 * /


/**
 * Recursive function to delete and store the collection data by batch
 * ref delete collection data: https://firebase.google.com/docs/firestore/manage-data/delete-data#collections
 * @param {import('firebase-admin').firestore} firestore
 * @param {import('firebase-admin').firestore.Query} query
 * @param {object[]} archiveStatusData
 * @param {() => object []} resolve
 * @returns
 */
async function deleteAndStoreQueryBatch(
  firestore,
  query,
  archiveStatusData,
  resolve
) {
  const snapshot = await query.get();
  if (snapshot.size === 0) {
    // When there are no documents left, we are done
    resolve(archiveStatusData);
    return;
  }

  // Delete documents in a batch
  const batch = firestore.batch();
  snapshot.docs.forEach((doc) => {
    // The following line in the recursive situation is working under simple
    // test case testing.
    archiveStatusData.push({ id: doc.id, ...doc.data() });
    batch.delete(doc.ref);
  });
  await batch.commit();

  // Recurse on the next process tick, to avoid
  // exploding the stack.
  process.nextTick(() => {
    deleteAndStoreQueryBatch(query, resolve);
  });
}

/**
 * Intial function to invoke delete and store the collection data.
 * @param {import('firebase-admin').firestore} firestore
 * @param {import('firebase-admin').firestore.CollectionReference} statusCollectionRef
 * @param {number} batchSize
 * @returns
 */
async function deleteAndStoreStatusCollection(
  firestore,
  statusCollectionRef,
  batchSize = 300
) {
  // this query can be used multiple time
  const query = statusCollectionRef.orderBy("__name__").limit(batchSize);
  const archiveStatusData = [];

  return new Promise((resolve, reject) => {
    deleteAndStoreQueryBatch(
      firestore,
      query,
      archiveStatusData,
      resolve
    ).catch(reject);
  });
}

/**
 * Delete images when corresponding tag is deleted
 * @param {firebaseAdmin} admin
 * @param {QueryDocumentSnapshot} snap
 */
async function deleteTagTrigger(admin, snap) {
  // https://firebase.google.com/docs/functions/config-env#access_environment_configuration_in_a_function
  const topicName = functions.config().campus.event_topic_name;
  const pubSubClient = new PubSub();

  const tagId = snap.id;
  const { createUserId: uid } = snap.data();
  const storageRef = admin.storage().bucket();
  const firestore = admin.firestore();
  const userDocRef = admin.firestore().collection("user").doc(uid);

  /** publish delete event by Pub/Sub */
  // https://cloud.google.com/pubsub/docs/quickstart-client-libraries#publish_messages
  try {
    // these fields are firestore object, need to process before encode to JSON string
    const { createTime, lastUpdateTime, coordinates } = snap.data();
    const { latitude, longitude } = coordinates;

    // the object can be stringified to readable json string
    const deleteTagDataToStringifyObject = {
      ...snap.data(), // first destruct original objects
      // * and then replace existed keys
      // * don't reverse the order!!!(don't assign replaced values first and
      //   then destruct)
      id: tagId,
      createTime: createTime.toDate().toISOString(),
      lastUpdateTime: lastUpdateTime.toDate().toISOString(),
      coordinates: { latitude, longitude },
    };

    const dataBuffer = Buffer.from(
      JSON.stringify({
        changeType: "deleted",
        tagContent: deleteTagDataToStringifyObject,
      })
    );
    const messageId = await pubSubClient.topic(topicName).publish(dataBuffer);
    logger.log(`publish ${tagId} delete event, message id: ${messageId}`);
  } catch (error) {
    logger.error(`publish ${tagId} delete event failed on topic ${topicName}`);
    logger.error(error);
  }

  // Decrement userAddTagNumber
  userDocRef.update({ userAddTagNumber: FieldValue.increment(-1) });
  logger.log(`Delete tag ${tagId} and update user add tags history`);

  /** archive status data */

  // batch archive and delete status data.
  // batch concept and usage: https://firebase.google.com/docs/firestore/manage-data/transactions#batched-writes

  const statusCollectionRef = firestore.doc(tagId).collection("status");

  const archiveStatusData = await deleteAndStoreStatusCollection(
    firestore,
    statusCollectionRef
  );

  /** get images */
  const options = {
    prefix: tagId,
  };
  const [files] = await storageRef.getFiles(options);

  /** Delete related images */
  // There may be more than 1 images related to 1 tag.
  const responses = await Promise.allSettled(
    files.map(async (file) => {
      // TODO: store and upload to archive storage bucket
      // but we need to prepare data and archive successfully before we delete data
      // so we need to split the archive and delete process
      await file.delete();
    })
  );
  const rejectedMessages = responses.filter(
    ({ status }) => status === "rejected"
  );
  if (rejectedMessages.length > 0) {
    logger.log(`${tagId} images delete failed.`);
    logger.error(rejectedMessages);
    return;
  }
  logger.log(`${tagId} images delete successfully.`);

  /** archived deleted content to cloud storage */

  // format token meaning
  // https://moment.github.io/luxon/#/formatting?id=table-of-tokens
  const archiveFileName = `${DateTime.now()
    .setZone("UTC+8")
    .toFormat("yyyyLLdd")}_${tagId}.json`;
  const archivedContent = {
    ...deleteTagTrigger,
    deleteTime: DateTime.now().setZone("UTC+8").toString(),
    status: archiveStatusData,
    imageNames: 1, // TODO
  };

  const archiveLocalFilePath = path.join(os.tmpdir(), archiveFileName);
  await fs.writeFile(archiveLocalFilePath, JSON.stringify(archivedContent));
}

module.exports = deleteTagTrigger;
