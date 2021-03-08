/**
 * @typedef {import('firebase-admin')} firebaseAdmin
 * @typedef {import('firebase-admin').firestore.QueryDocumentSnapshot} QueryDocumentSnapshot
 * /

/**
 * Delete images when corresponding tag is deleted
 * @param {firebaseAdmin} admin
 * @param {QueryDocumentSnapshot} snap 
 */
async function deleteImagesTrigger(admin, snap) {
  const tagId = snap.id;
  const storageRef = admin.storage().bucket();

  const options = {
    prefix: tagId,
  };
  const [files] = await storageRef.getFiles(options);

  const responses = await Promise.allSettled(files.map(file => file.delete()));
  const rejectedMessages = responses.filter(
    ({ status }) => status === 'rejected'
  );
  if (rejectedMessages.length > 0) {
    console.log(`${tagId} images delete failed.`);
    console.error(rejectedMessages);
    return;
  }
  console.log(`${tagId} images delete successfully.`);
}

module.exports = deleteImagesTrigger;
