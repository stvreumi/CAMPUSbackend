// https://github.com/ai/nanoid
const { nanoid } = require('nanoid');
const { ForbiddenError } = require('apollo-server');

const { GeoPoint, FieldValue } = require('firebase-admin').firestore;
const { geohashForLocation } = require('geofire-common');

const maxPageSize = 30;
const defaultPageSize = 10;

function generateFileName(imageNumber, tagID) {
  // id generator: [nanoid](https://github.com/ai/nanoid)
  return [...new Array(imageNumber)].map(
    () => `${tagID}/${nanoid().substring(0, 8)}`
  );
}

/**
 * @typedef {import('../types').StatusWithDocumentReference} StatusWithDocumentReference
 * @typedef {import('../types').DataPage} DataPage
 * @typedef {import('../types').PageParams} PageParams
 * @typedef {import('firebase-admin').firestore.QueryDocumentSnapshot} QueryDocumentSnapshot
 * @typedef {import('firebase-admin').firestore.Query} Query
 * @typedef {import('firebase-admin').firestore.CollectionReference} TagCollectionReference
 */

/**
 * Get latest status of current tag document `status` collection
 * @param {import("firebase-admin").firestore.CollectionReference} collectionRef
 *  The document we want to get the latest status
 * @returns {Promise<StatusWithDocumentReference>}
 */
async function getLatestStatus(collectionRef) {
  const statusDocSnap = await collectionRef
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
 * @param {DecodedUserInfoFromAuthHeader} userInfo
 * @returns {AddTagDataInput | UpdateTagDataInput}
 */
function generateTagDataToStoreInFirestore(action, data, userInfo) {
  const { uid } = userInfo;
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
 * The cursor format is : "${timeMillis},{documentId}"
 * @param {Query} query
 * @param {(doc: QueryDocumentSnapshot) => object} dataHandleFunction
 * @param {PageParams} pageParams
 * @param {TagCollectionReference} collectionReference used for getting cursor document
 */
const queryOrdeyWithPageParams = async (
  query,
  dataHandleFunction,
  collectionReference,
  pageParams = {}
) => {
  const { pageSize = defaultPageSize, cursor = '' } = pageParams;
  const cursorRegex = /\w+/g;
  const hasCursor = cursorRegex.test(cursor);
  const cursorSnapshot = hasCursor
    ? await collectionReference.doc(cursor).get()
    : null;

  // limit the the lenth of the data in a fetch
  const queryPageSize = pageSize > maxPageSize ? maxPageSize : pageSize;

  const data = [];

  const querySnapshot = hasCursor
    ? await query.startAfter(cursorSnapshot).limit(queryPageSize).get()
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
 * @param {TagCollectionReference} collectionReference
 */
const getPage = async (query, pageParams, collectionReference) => {
  /**
   *
   * @param {Timestamp} timestamp
   */
  const dataHandleFunction = getIdWithDataFromDocSnap;

  const { data, empty } = await queryOrdeyWithPageParams(
    query,
    dataHandleFunction,
    collectionReference,
    pageParams
  );

  const { id: cursorId } = !empty ? data[data.length - 1] : {};
  return {
    data,
    pageInfo: {
      empty,
      cursor: !empty ? `${cursorId}` : '',
    },
  };
};

module.exports = {
  generateFileName,
  getLatestStatus,
  getIdWithDataFromDocSnap,
  checkUserLogIn,
  generateTagDataToStoreInFirestore,
  getPage,
};
