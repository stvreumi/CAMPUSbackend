import { PubSub } from '@google-cloud/pubsub';

// Creates a client; cache this for further use
const pubSubClient = new PubSub();
const subscriptionName = process.env.CAMPUS_EVENT_SUPSCRIPTION_NAME || 'test';

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

    // * delete event from firebase function delete event trigger function
    // * event delivered by GCP Pub/Sub
    // * event name: `deleted`
    // * the pub/sub may deliver event multiple times, so the subscribe function
    //   must be idempotent function.
    //   https://stackoverflow.com/questions/53823366/google-pubsub-and-duplicated-messages-from-the-topic
    // * https://cloud.google.com/pubsub/docs/quickstart-client-libraries#receive_messages
    subscription.on('message', async message => {
      console.log(`receive message id: ${message.id}`);
      const { changeType, tagContent } = JSON.parse(message.data);

      // "Ack" (acknowledge receipt of) the message
      // (maybe) ack as soon as possible
      message.ack();

      // error, no changeType or the event name is not 'deleted'
      if (changeType !== 'deleted') {
        console.error('Error when receive pub/sub data. Received data: ');
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
      const res = await algoliaIndexClient.deleteObject(id);
      console.log('algolia delete object result:');
      console.dir(res);
    });
  },
});

export default PubSubHandlers;
