const { Timestamp } = require('firebase-admin').firestore;
const { DateTime } = require('luxon');
/**
 *
 * @param {import('firebase-admin').firestore.Firestore} firestore
 * @param {import('events').EventEmitter} eventEmitter
 * @returns
 */
const PubSubHandlers = (firestore, eventEmitter) => ({
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
  tagChangeSubscription: onMessage => {
    const listenOnTagChangeEvents = changeType => {
      eventEmitter.on(changeType, idWithResultData =>
        onMessage({
          tagChangeSubscription: {
            changeType,
            subAfter: null,
            tagContent: idWithResultData,
          },
        })
      );
    };
    // register listening function
    listenOnTagChangeEvents('added');
    listenOnTagChangeEvents('updated');
    listenOnTagChangeEvents('archived');
  },
});

module.exports = PubSubHandlers;
