const { v4: uuidv4 } = require('uuid');
const { ForbiddenError } = require('apollo-server');

function generateFileName(imageNumber, tagID) {
  return [...new Array(imageNumber)].map(
    () => `${tagID}/${uuidv4().substr(0, 8)}`
  );
}

/**
 * Get latest status of current tag document `status` collection
 * @param {DocumentReference} docRef The document we want to get the latest
 *   status
 * @param {data} Boolean if true, return data, else return DocumentSnapshot
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
 * @param {DocumentReference} docRef The document we want to get the data
 */
async function getDataFromTagDocRef(docRef) {
  const { statusDocRef: _, ...status } = await getLatestStatus(docRef);
  const data = {
    id: docRef.id,
    status,
    // move to resolver
    // statusHistory: await getStatusHistory(docRef),
    ...(await docRef.get()).data(),
  };
  return data;
}

/**
 * Get User's intent and its answer
 */
async function getIntentFromDocRef(docRef) {
  let data;
  await docRef.get().then(function (doc) {
    if (doc.exists) {
      data = {
        userintent: doc.data().userintent,
        useranswer: doc.data().useranswer,
      };
      // console.log(data);
    }
  });
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

exports.generateFileName = generateFileName;
exports.getLatestStatus = getLatestStatus;
exports.getDataFromTagDocRef = getDataFromTagDocRef;
exports.getIntentFromDocRef = getIntentFromDocRef;
exports.checkUserLogIn = checkUserLogIn;
