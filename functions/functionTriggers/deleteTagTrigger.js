const { FieldValue } = require("firebase-admin").firestore;
/**
 * @typedef {import('firebase-admin')} firebaseAdmin
 * @typedef {import('firebase-admin').firestore.QueryDocumentSnapshot} QueryDocumentSnapshot
 * /

/**
 * Delete images when corresponding tag is deleted
 * @param {firebaseAdmin} admin
 * @param {QueryDocumentSnapshot} snap 
 */
async function deleteTagTrigger(admin, snap) {
  const tagId = snap.id;
  const { createUserId: uid } = snap.data();
  const storageRef = admin.storage().bucket();
  const userDocRef = admin.firestore().collection("user").doc(uid);

  // Decrement userAddTagNumber
  userDocRef.update({ userAddTagNumber: FieldValue.increment(-1) });
  console.log(`Delete tag ${tagId} and update user add tags history`);

  // Delete related images
  // There may be more than 1 images related to 1 tag.
  const options = {
    prefix: tagId,
  };
  const [files] = await storageRef.getFiles(options);

  const responses = await Promise.allSettled(
    files.map((file) => file.delete())
  );
  const rejectedMessages = responses.filter(
    ({ status }) => status === "rejected"
  );
  if (rejectedMessages.length > 0) {
    console.log(`${tagId} images delete failed.`);
    console.error(rejectedMessages);
    return;
  }
  console.log(`${tagId} images delete successfully.`);
}

module.exports = deleteTagTrigger;
