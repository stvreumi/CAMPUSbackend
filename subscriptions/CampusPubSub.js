// ref: https://github.com/m19c/graphql-firestore-subscriptions
const { PubSubEngine } = require('graphql-subscriptions');

const PubSubHandlers = require('./PubSubHandlers');

/**
 * note of async-iterator
 * pushQueue: Store the data of occured event.
 * pullQueue: Store the unresolved function.
 * - If there is no data in the pushQueue when the iterator want data(`next()`),
 *   it will push resolve function into pullQueue.
 * - When there is a new event occur, it will first check if there is any
 *   unresolved function in the pullQueue and try to resolve it. If no, it just
 *   push the value into pushQueue.
 */

/**
 * @typedef {() => any | boolean} Unsubscribe
 * @typedef {import('firebase-admin').firestore.Firestore} Firestore
 */

// https://github.com/apollographql/graphql-subscriptions/blob/master/src/pubsub-engine.ts
class CampusPubSub extends PubSubEngine {
  /**
   *
   * @param {Firestore} firestore
   */
  constructor(firestore) {
    super();

    this.handlers = PubSubHandlers(firestore);
    this.nextSubscriptionId = 0;
    /** @type {Map<number, Unsubscribe>} */
    this.subscriptions = new Map();
  }

  /** private use member */
  async getNextSubscriptionId() {
    const subId = this.nextSubscriptionId;
    this.nextSubscriptionId += 1;
    return subId;
  }

  /**
   *
   * @param {string} triggerName Alternative name: `topic`. The parameter name
   *  uses the parent abstract class definition.
   * @param {Function} onMessage Broadcast/push event data to the destination.
   * @param {Object} options
   * @returns {Promise<number>}
   */
  async subscribe(triggerName, onMessage, _) {
    //ISO string example 2011-10-05T14:48:00.000Z
    const tagChangeSubscriptionEventPrefix = "tagChangeSubscription_";
    if (!(triggerName in this.handlers) && !(triggerName.startsWith(tagChangeSubscriptionEventPrefix))) {
      throw new Error(
        `Cannot subscribe to topic/trigger-name ${triggerName} - no handlers`
      );
    }
    const subscriptionId = await this.getNextSubscriptionId();
    if(triggerName.startsWith(tagChangeSubscriptionEventPrefix)) {
      const handler = this.handlers.tagChangeSubscription;
      const subAfter = triggerName.substr(tagChangeSubscriptionEventPrefix.length)
      this.subscriptions.set(subscriptionId, handler(onMessage, {subAfter}));
      return;
    }

    // else
    const handler = this.handlers[triggerName];
    this.subscriptions.set(subscriptionId, handler(onMessage));
    return;
  }

  /**
   *
   * @param {number} subId
   */
  async unsubscribe(subId) {
    const unsubscribe = this.subscriptions.get(subId);

    if (!unsubscribe) {
      return;
    }

    unsubscribe();
    this.subscriptions.delete(subId);
  }

  // eslint-disable-next-line
  async publish(triggerName, payload) {
    // noop
  }
}

module.exports = CampusPubSub;
