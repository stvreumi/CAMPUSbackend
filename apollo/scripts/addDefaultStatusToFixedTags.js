const admin = require('firebase-admin');
const { FieldValue } = require('firebase-admin').firestore;

// Please set google credential in the env when running
admin.initializeApp({
  credential: admin.credential.applicationDefault(),
});

const firestore = admin.firestore();

const defaultStatus = {
  statusName: '非常不壅擠',
  description: '',
  createTime: FieldValue.serverTimestamp(),
  createUserId: 'admin',
  numberOfUpVote: null,
};

async function main() {
  const collectionRef = firestore.collection('fixedTagSubLocation');
  const fixedTagsSnapshot = await collectionRef.get();
  const promises = [];
  fixedTagsSnapshot.forEach(doc => {
    promises.push(doc.ref.collection('status').add(defaultStatus));
  });

  await Promise.all(promises);
}

main()
  .then(() => console.log('finish update default status'))
  .catch(error => console.log(error));
