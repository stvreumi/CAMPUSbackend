/** @module TagResearchDataSource */
const { DataSource } = require('apollo-datasource');
const { FieldValue } = require('firebase-admin').firestore;

/** @type {import('pino').Logger} */
const logger = require('pino-caller')(require('../../logger'));

const {
  getIdWithDataFromDocSnap,
  getLatestStatus,
  checkUserLogIn,
  generateTagResearchDataToStoreInFirestore,
  getPage,
} = require('./firebaseUtils');

// used for type annotation
/**
 * @typedef {import('../types').RawTagDocumentFields} RawTagDocumentFields
 * @typedef {import('firebase-admin').firestore.CollectionReference<RawTagDocumentFields>} TagCollectionReference
 * @typedef {import('firebase-admin').firestore.CollectionReference} CollectionReference
 * @typedef {import('firebase-admin').firestore.DocumentReference} DocumentReference
 * @typedef {import('firebase-admin').firestore.Firestore} Firestore
 * @typedef {import('../types').DecodedUserInfoFromAuthHeader} DecodedUserInfoFromAuthHeader
 * @typedef {import('../types').Status} Status
 * @typedef {import('../types').AddTagDataInput} AddTagDataInput
 * @typedef {import('../types').AddorUpdateTagResponse} AddorUpdateTagResponse
 * @typedef {import('../types').UpdateTagDataInput} UpdateTagDataInput
 * @typedef {import('../types').PageParams} PageParams
 * @typedef {import('../types').TagPage} TagPage
 * @typedef {import('../types').StatusPage} StatusPage
 */

//@ts-check
class TagResearchDataSource extends DataSource {
  /**
   * Use admin to construct necessary entity of communication
   * @param {CollectionReference} tagResearchDataCollectionRef
   * @param {CollectionReference} userActivityResearchCollectionRef
   * @param {CollectionReference} fixedTagCollectionRef
   * @param {CollectionReference} fixedTagSubLocationCollectionRef
   * @param {number} archivedThreshold
   * @param {Firestore} firestore
   * @param {import('events').EventEmitter} eventEmitter
   * @param {import('algoliasearch').SearchIndex} algoliaIndexClient
   */
  constructor(
    tagResearchDataCollectionRef,
    userActivityResearchCollectionRef,
    archivedThreshold,
    firestore,
    eventEmitter,
    algoliaIndexClient
  ) {
    super();
    this.tagResearchDataCollectionRef = tagResearchDataCollectionRef;
    this.userActivityResearchCollectionRef = userActivityResearchCollectionRef;
    this.archivedThreshold = archivedThreshold;
    this.firestore = firestore;
    this.eventEmitter = eventEmitter;
    this.algoliaIndexClient = algoliaIndexClient;
  }

  /**
   * This is a function that gets called by ApolloServer when being setup.
   * This function gets called with the datasource config including things
   * like caches and context. We'll assign this.context to the request context
   * here, so we can know about the user making requests
   */
  initialize(config) {
    this.context = config.context;
  }

  async getAllUnarchivedTags(pageParams) {
    const query = this.tagResearchDataCollectionRef
      .where('archived', '==', false)
      .orderBy('lastUpdateTime', 'desc');
    const { data: tags, pageInfo } = await getPage(
      query,
      pageParams,
      this.tagResearchDataCollectionRef
    );
    return { tags, ...pageInfo };
  }

  /**
   * get tag detail from collection `tag_detail`
   * @async
   * @param {object} param
   * @param {string} param.tagId tagId of the document with detailed info.
   * @returns {Promise<RawTagDocumentFields>|null}
   */
  async getTagResearchData({ tagId }) {
    const doc = await this.tagResearchDataCollectionRef.doc(tagId).get();
    if (!doc.exists) {
      return null;
    }
    return getIdWithDataFromDocSnap(doc);
  }

  async getStatusHistory({ tagId, pageParams }) {
    const docRef = this.tagResearchDataCollectionRef.doc(tagId);

    const query = await docRef
      .collection('status')
      .orderBy('createTime', 'desc');

    const { data, pageInfo } = await getPage(
      query,
      pageParams,
      docRef.collection('status')
    );
    const statusList = data.map(status => ({ ...status, type: 'tag' }));

    return { statusList, ...pageInfo };
  }

  async addorUpdateTagResearchDataToFirestore(action, { data, userInfo }) {
    const { statusName, statusDescName } = data;
    const tagData = generateTagResearchDataToStoreInFirestore(
      action,
      data,
      userInfo
    );

    if (action === 'add') {
      // add tagData to server
      const refAfterTagAdd = await this.tagResearchDataCollectionRef.add(
        tagData
      );
      const { id: newAddedTagId } = refAfterTagAdd;

      await this.updateTagResearchStatus({
        tagId: newAddedTagId,
        statusName,
        statusDescName,
        userInfo,
      });

      // send data to algolia index for searching
      if (this.algoliaIndexClient) {
        const { locationName, category } = tagData;
        // https://www.algolia.com/doc/guides/sending-and-managing-data/send-and-update-your-data/how-to/incremental-updates/?client=javascript#adding-records
        const res = await this.algoliaIndexClient.saveObject({
          objectID: newAddedTagId,
          locationName,
          category,
          statusName,
          statusDescName,
        });
        console.log('algolia add object result:');
        console.dir(res);
      }

      return getIdWithDataFromDocSnap(await refAfterTagAdd.get());
    }
    throw Error('Undefined action of tagData operation.');
  }

  async addNewTagResearchData({ data, userInfo }) {
    // check user status
    const { logIn } = userInfo;
    checkUserLogIn(logIn);
    // add tagData to firestore
    const tag = await this.addorUpdateTagResearchDataToFirestore('add', {
      data,
      userInfo,
    });

    const { imageUploadNumber } = data;
    return {
      tag,
      imageUploadNumber,
    };
  }

  async updateTagResearchStatus({
    tagId,
    statusName,
    statusDescName,
    userInfo,
  }) {
    const { logIn, uid } = userInfo;
    checkUserLogIn(logIn);
    const statusData = {
      statusName,
      statusDescName,
      createTime: FieldValue.serverTimestamp(),
      createUserId: uid,
    };
    const docRef = await this.tagResearchDataCollectionRef
      .doc(tagId)
      .collection('status')
      .add(statusData);
    // update status field in the record of algolia index
    if (this.algoliaIndexClient) {
      await this.algoliaIndexClient.partialUpdateObject({
        objectID: tagId,
        statusName,
        statusDescName,
      });
    }
    return { ...getIdWithDataFromDocSnap(await docRef.get()), type: 'tag' };
  }

  async triggerEvent(eventName, tagData) {
    this.eventEmitter.emit(eventName, tagData);
  }

  async recordUserActivity(action, userInfo, tagId = null) {
    const { uid: userId } = userInfo;
    await this.userActivityResearchCollectionRef.add({
      action,
      userId,
      tagId,
      createTime: FieldValue.serverTimestamp(),
    });
  }

  async getLatestStatusData({ tagId, userInfo }) {
    const statusCollectionRef = this.tagResearchDataCollectionRef
      .doc(tagId)
      .collection('status');

    const { statusDocRef, ...latestStatusData } = await getLatestStatus(
      statusCollectionRef
    );

    // if there is no status or the numberOfUpVote is null, raise error
    if (!statusDocRef) {
      throw Error('No status in this tag.');
    }

    // check if user has upvote
    let hasUpVote = null;
    if (userInfo) {
      const { uid } = userInfo;
      const tagStatusUpVoteUserRef = statusDocRef
        .collection('UpVoteUser')
        .doc(uid);
      const tagStatusUpVoteUserSnap = await tagStatusUpVoteUserRef.get();
      // if this task is not 問題回報, return `hasUpVote` with null
      const { numberOfUpVote } = latestStatusData;
      hasUpVote =
        numberOfUpVote !== null ? tagStatusUpVoteUserSnap.exists : null;
    }

    return {
      ...latestStatusData,
      hasUpVote,
      type: 'tag',
    };
  }
} // class TagResearchDataSource

module.exports = TagResearchDataSource;
