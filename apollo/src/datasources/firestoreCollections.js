// the collection name constraints
// https://firebase.google.com/docs/firestore/quotas#limits
module.exports = {
  /**
   * Old tagData is stored in the collection `tagData`. The old data contain
   * service learning and self test data in semester 110-1.
   */
  // the following collection is used to collection service learning data in
  // semester 110-2.
  tagDataCollectionName: 'tagData',
};
