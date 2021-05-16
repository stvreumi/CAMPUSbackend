const { v4: uuidv4 } = require('uuid');
const { ForbiddenError } = require('apollo-server');
const { firestore } = require('firebase-admin');

const { Timestamp, GeoPoint, FieldPath } = require('firebase-admin').firestore;
const { DateTime } = require('luxon');
const { geohashForLocation } = require('geofire-common');

const { FieldValue } = firestore;

const maxPageSize = 30;
const defaultPageSize = 10;

function generateFileName(imageNumber, tagID) {
  return [...new Array(imageNumber)].map(
    () => `${tagID}/${uuidv4().substr(0, 8)}`
  );
}

/**
 * @typedef {import('../types').StatusWithDocumentReference} StatusWithDocumentReference
 * @typedef {import('../types').DataPage} DataPage
 * @typedef {import('../types').PageParams} PageParams
 * @typedef {import('firebase-admin').firestore.QueryDocumentSnapshot} QueryDocumentSnapshot
 * @typedef {import('firebase-admin').firestore.Query} Query
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
 * Generate tag data object which stroe in the firestore from original raw data
 * @param {string} action
 * @param {AddTagDataInput} data
 * @param {Promise<string>} uid
 */
function generateTagDataToStoreInFirestore(action, data, uid) {
  // get data which would be non-null
  const {
    locationName,
    coordinates,
    category,
    floor = null,
    streetViewInfo = null,
  } = data;

  const tagData = {
    locationName,
    category,
    lastUpdateTime: FieldValue.serverTimestamp(),
    floor,
    streetViewInfo,
  };
  if (coordinates) {
    const { latitude, longitude } = coordinates;
    tagData.coordinates = new GeoPoint(
      parseFloat(latitude),
      parseFloat(longitude)
    );
    // https://firebase.google.com/docs/firestore/solutions/geoqueries
    tagData.geohash = geohashForLocation([
      parseFloat(latitude),
      parseFloat(longitude),
    ]);
  }
  if (action === 'add') {
    // get data which would be nullable
    return {
      ...tagData,
      createTime: FieldValue.serverTimestamp(),
      createUserId: uid,
      archived: false,
      viewCount: 0,
    };
  }
  if (action === 'update') {
    // filter out not change data (undefined)
    return Object.keys(tagData)
      .filter(key => tagData[key] !== undefined && tagData[key] !== null)
      .reduce((obj, key) => ({ ...obj, [key]: tagData[key] }), {});
  }

  throw Error('Undefined action of tagData operation.');
}

/**
 * Extract data from tag document reference
 * @param {import('firebase-admin').firestore.QueryDocumentSnapshot} docRef The document we want to get the data
 */
function getIdWithDataFromDocSnap(docSnap) {
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

/**
 *
 * @param {number | string} mills
 * @returns {Timestamp}
 */
const getFirebaseTimestamp = mills => {
  if (typeof mills === 'string') {
    return Timestamp.fromMillis(parseInt(mills, 10));
  }
  return Timestamp.fromMillis(mills);
};

/**
 *
 * @param {Timestamp} timestamp
 */
const getMillsFromTimestamp = timestamp => timestamp.toMillis();

/**
 * The cursor format is : "${timeMillis},{documentId}"
 * @param {Query} query
 * @param {(doc: QueryDocumentSnapshot) => object} dataHandleFunction
 * @param {PageParams} pageParams
 */
const queryOrdeyByTimestampWithPageParams = async (
  query,
  dataHandleFunction,
  pageParams = {}
) => {
  const { pageSize = defaultPageSize, cursor = '' } = pageParams;
  const cursorRegex = /\d+,\w+/g;
  const hasCursor = cursorRegex.test(cursor);

  const [timeCursor, idCursor] = hasCursor ? cursor.split(',') : [null, null];

  // limit the the lenth of the data in a fetch
  const queryPageSize = pageSize > maxPageSize ? maxPageSize : pageSize;

  const data = [];

  const cursorTimestamp = hasCursor ? getFirebaseTimestamp(timeCursor) : null;
  const querySnapshot = hasCursor
    ? await query
        .startAfter(cursorTimestamp, idCursor)
        .limit(queryPageSize)
        .get()
    : await query.limit(queryPageSize).get();
  querySnapshot.forEach(doc => {
    data.push(dataHandleFunction(doc));
  });

  return {
    data,
    empty: querySnapshot.empty,
  };
};

/**
 *
 * @param {Query} query
 * @param {PageParams} pageParams
 */
const getPage = async (query, pageParams) => {
  const dataHandleFunction = getIdWithDataFromDocSnap;

  const { data, empty } = await queryOrdeyByTimestampWithPageParams(
    query,
    dataHandleFunction,
    pageParams
  );

  const { createTime: cursorCreateTime, id: cursorId } = !empty
    ? data[data.length - 1]
    : {};
  return {
    data,
    pageInfo: {
      empty,
      cursor: !empty
        ? `${getMillsFromTimestamp(cursorCreateTime)},${cursorId}`
        : '',
    },
  };
};

module.exports = {
  generateFileName,
  getLatestStatus,
  getIdWithDataFromDocSnap,
  checkUserLogIn,
  insertDefualtStatusObjToTagDoc,
  queryOrdeyByTimestampWithPageParams,
  getMillsFromTimestamp,
  generateTagDataToStoreInFirestore,
  getPage,
};
