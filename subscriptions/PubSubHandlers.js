const { Timestamp } = require("firebase-admin").firestore;

/**
 *
 * @param {import('firebase-admin').firestore.Firestore} firestore
 * @returns
 */
const PubSubHandlers = (firestore) => ({
  archivedThreshold_change: (onMessage) =>
    firestore
      .collection("setting")
      .doc("tag")
      .onSnapshot((docSnapshot) => {
        if (docSnapshot.exists) {
          console.log(docSnapshot.data());
          onMessage({
            archivedThreshold: docSnapshot.data().archivedThreshold,
          });
        }
      }),
  tagChangeSubscription: (onMessage, { subAfter }) => {
    let firestoreTimestamp;
    try {
      firestoreTimestamp = Timestamp.fromMillis(parseInt(subAfter, 10));
    } catch (e) {
      throw Error("The timestamp format is not valid");
    }

    return firestore
      .collection("tagData")
      .where("archived", "==", false)
      .orderBy("lastUpdateTime", "desc")
      .startAfter(firestoreTimestamp)
      .onSnapshot((querySnapshot) => {
        querySnapshot.docChanges().forEach((change) => {
          const changeType = change.type;
          const data = change.doc.data();
          console.log(changeType);
          console.log(data);
          onMessage({
            tagChangeSubscription: {
              id: change.doc.id,
              changeType,
              ...data,
            },
          });
        });
      });
  },
});

module.exports = PubSubHandlers;
