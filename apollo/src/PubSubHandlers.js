const { Timestamp } = require('firebase-admin').firestore;
const { DateTime } = require('luxon');
/**
 *
 * @param {import('firebase-admin').firestore.Firestore} firestore
 * @returns
 */
const PubSubHandlers = firestore => ({
  archivedThreshold_change: onMessage =>
    firestore
      .collection('setting')
      .doc('tag')
      .onSnapshot(docSnapshot => {
        if (docSnapshot.exists) {
          onMessage({
            archivedThreshold: docSnapshot.data().archivedThreshold,
          });
        }
      }),
  tagChangeSubscription: (onMessage, { subAfter }) => {
    let firestoreTimestamp;
    const millsOfSubAfter = parseInt(subAfter, 10);
    try {
      firestoreTimestamp = Timestamp.fromMillis(millsOfSubAfter);
    } catch (e) {
      throw Error('The timestamp format is not valid');
    }

    return firestore
      .collection('tagData')
      .where('archived', '==', false)
      .orderBy('lastUpdateTime')
      .startAfter(firestoreTimestamp)
      .onSnapshot(querySnapshot => {
        querySnapshot.docChanges().forEach(change => {
          const changeType = change.type;
          const data = change.doc.data();
          const { id } = change.doc;
          onMessage({
            tagChangeSubscription: {
              changeType,
              subAfter: DateTime.fromMillis(millsOfSubAfter)
                .setZone('UTC+8')
                .toString(),
              tagContent: {
                id,
                ...data,
              },
            },
          });
        });
      });
  },
});

module.exports = PubSubHandlers;
