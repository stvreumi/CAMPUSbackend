const { PubSub } = require('@google-cloud/pubsub');
const { json } = require('body-parser');

// Creates a client; cache this for further use
const pubSubClient = new PubSub();
const subscriptionName = process.env.CAMPUS_EVENT_SUPSCRIPTION_NAME;

const subscription = pubSubClient.subscription(subscriptionName);

/**
 *
 * @param {import('firebase-admin').firestore.Firestore} firestore
 * @param {import('events').EventEmitter} eventEmitter
 * @param {import('algoliasearch').SearchIndex} algoliaIndexClient
 * @returns
 */
const PubSubHandlers = (firestore, eventEmitter, algoliaIndexClient) => ({
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
            tagContent: idWithResultData,
          },
        })
      );
    };
    // register listening function

    // event emitted location: [CAMPUS-backend dir]/apollo/src/resolvers/resolvers.js
    listenOnTagChangeEvents('added');
    listenOnTagChangeEvents('updated');
    // event emitted location: `checkIfNeedArchived` from [CAMPUS-backend dir]/apollo/src/datasources/TagDataSource.js
    listenOnTagChangeEvents('archived');

    // delete event from firebase function delete event trigger function
    // event delivered by GCP Pub/Sub
    // https://cloud.google.com/pubsub/docs/quickstart-client-libraries#receive_messages
    // event name: `deleted`
    subscription.on('message', message => {
      console.log(`receive message id: ${message.id}`);
      const { changeType, tagContent } = JSON.parse(message.data);
      // error, no changeType or the event name is not 'deleted'
      if (changeType !== 'deleted') {
        console.log('Error when receive pub/sub data. Received data: ');
        console.dir(message.data);
        return;
      }
      onMessage({
        tagChangeSubscription: {
          changeType,
          tagContent,
        },
      });

      const { id } = tagContent;
      // algolia_object_delete
      // It's async function, but no need to await in this situation
      algoliaIndexClient.deleteObject(id);

      // "Ack" (acknowledge receipt of) the message
      message.ack();
    });
  },
});

module.exports = PubSubHandlers;
