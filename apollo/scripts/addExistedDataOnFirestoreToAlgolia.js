const admin = require('firebase-admin');
const algoliasearch = require('algoliasearch');
const {
  tagDataCollectionName,
} = require('../src/datasources/constants.js');

// Please set google credential in the env when running
admin.initializeApp({
  credential: admin.credential.applicationDefault(),
});

const firestore = admin.firestore();

// You need to use the the same api key and index name as on the cloud run
const { ALGOLIA_APPLICATION_ID, ALGOLIA_API_KEY, ALGOLIA_INDEX_NAME } =
  process.env;
/** @type import('algoliasearch').SearchIndex */
const algoliaIndexClient = algoliasearch(
  ALGOLIA_APPLICATION_ID,
  ALGOLIA_API_KEY
).initIndex(ALGOLIA_INDEX_NAME);

const main = async () => {
  // prepared data for indexing
  const tagDataSnap = await firestore.collection(tagDataCollectionName).get();
  const allExistedDataSendToAlgolia = [];
  await Promise.all(
    tagDataSnap.docs.map(async doc => {
      const { locationName, category } = doc.data();

      const [latestStatusDoc] = (
        await firestore
          .collection(tagDataCollectionName)
          .doc(doc.id)
          .collection('status')
          .orderBy('createTime', 'desc')
          .limit(1)
          .get()
      ).docs;
      const { statusName } = latestStatusDoc.data();
      allExistedDataSendToAlgolia.push({
        objectID: doc.id,
        locationName,
        category,
        statusName,
      });
      console.log(`add tag id: ${doc.id}`);
    })
  );
  console.dir(allExistedDataSendToAlgolia);
  console.log(`total migrate data size: ${allExistedDataSendToAlgolia.length}`);

  // send to algolia
  try {
    const res = await algoliaIndexClient.saveObjects(
      allExistedDataSendToAlgolia
    );
    console.dir(res);
  } catch (e) {
    console.error(e);
  }
};

try {
  main();
} catch (e) {
  console.error(e);
}
