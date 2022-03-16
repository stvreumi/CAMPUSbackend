const admin = require('firebase-admin');
const {
  tagDataCollectionName,
} = require('../src/datasources/firestoreCollections');

admin.initializeApp({
  credential: admin.credential.applicationDefault(),
});

const firestore = admin.firestore();

const main = async () => {
  const batch = firestore.batch();
  const tagDataSnap = await firestore.collection(tagDataCollectionName).get();
  console.log('after get');
  // batch write?
  // replace
  tagDataSnap.forEach(doc => {
    console.log('test in the forEach');
    /** @type {{missionName: string}}  */
    const { category } = doc.data();
    const { missionName } = category;
    const newMissionName = missionName.replace('任務', '回報');
    console.log(`change ${missionName} to ${newMissionName}`);
    batch.update(doc.ref, {
      category: { ...category, missionName: newMissionName },
    });
  });

  // the single batch commit can only accept up to 500 operations
  await batch.commit();
  console.log('finish update');
};

try {
  console.log('start running');
  main();
} catch (e) {
  console.error(e);
}
