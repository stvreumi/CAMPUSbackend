const { v4: uuidv4 } = require('uuid');
const { ForbiddenError } = require('apollo-server');
const { firestore } = require('firebase-admin');

const { FieldValue } = firestore;

function generateFileName(imageNumber, tagID) {
  return [...new Array(imageNumber)].map(
    () => `${tagID}/${uuidv4().substr(0, 8)}`
  );
}

/**
 * @typedef {import('../types').StatusWithDocumentReference} StatusWithDocumentReference
 */

/**
 * Get latest status of current tag document `status` collection
 * @param {import("firebase-admin").firestore.DocumentReference} docRef
 *  The document we want to get the latest status
 * @returns {Promise<StatusWithDocumentReference>}
 */
async function getLatestStatus(docRef) {
  const statusDocSnap = await docRef
    .collection('status')
    .orderBy('createTime', 'desc')
    .limit(1)
    .get();
  if (statusDocSnap.empty) {
    throw Error('No status document!');
  }
  const statusRes = [];

  // just to retrieve value, only loop once
  statusDocSnap.forEach(doc => {
    statusRes.push({
      statusDocRef: doc.ref,
      ...doc.data(),
    });
  });
  const [currentStatus] = statusRes;
  return currentStatus;
}

/**
 * Extract data from tag document reference
 * @param {import('firebase-admin').firestore.DocumentSnapshot} docRef The document we want to get the data
 */
async function getTagDataFromTagDocSnap(docSnap) {
  const data = {
    id: docSnap.id,
    ...docSnap.data(),
  };
  return data;
}

/**
 * Check if user is log in. If not, raise ForbiddenError
 * @param {Boolean} logIn logIn status
 */
function checkUserLogIn(logIn) {
  if (!logIn) {
    // TODO: anonymous user data or throw authorize error
    throw new ForbiddenError('User is not login');
  }
}

/**
 *
 * @param {firestore.DocumentReference} tagDocRef
 * @param {string} missionName
 * @param {string} description
 * @param {string} uid
 * @returns {Promise<void>}
 */
async function insertDefualtStatusObjToTagDoc(
  tagDocRef,
  missionName,
  description = '',
  uid
) {
  const getDefaultStatus = () => {
    switch (missionName) {
      case '設施任務':
        return '存在';
      case '問題任務':
        return '待處理';
      case '動態任務':
        return '人少';
      default:
        return '';
    }
  };
  const defaultStatusData = {
    statusName: getDefaultStatus(),
    description,
    createTime: FieldValue.serverTimestamp(),
    createUserId: uid,
    numberOfUpVote: missionName === '問題任務' ? 0 : null,
  };
  // add tag default status, need to use original CollectionReference
  await tagDocRef.collection('status').add(defaultStatusData);
}

module.exports = {
  generateFileName,
  getLatestStatus,
  getTagDataFromTagDocSnap,
  checkUserLogIn,
  insertDefualtStatusObjToTagDoc,
};
