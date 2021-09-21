/** @module TagDataSource */
const { DataSource } = require('apollo-datasource');
const { FieldValue } = require('firebase-admin').firestore;

const algoliasearch = require('algoliasearch');

const {
  getIdWithDataFromDocSnap,
  getLatestStatus,
  checkUserLogIn,
  generateTagDataToStoreInFirestore,
  getPage,
} = require('./firebaseUtils');

const { upVoteActionName, cancelUpVoteActionName } = require('./constants');

// used for type annotation
/**
 * @typedef {import('../types').RawTagDocumentFields} RawTagDocumentFields
 * @typedef {import('firebase-admin').firestore.CollectionReference<RawTagDocumentFields>} TagCollectionReference
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
class TagDataSource extends DataSource {
  /**
   * Use admin to construct necessary entity of communication
   * @param {TagCollectionReference} tagDataCollectionReference
   * @param {number} archivedThreshold
   * @param {Firestore} firestore
   * @param {import('events').EventEmitter} eventEmitter
   */
  constructor(
    tagDataCollectionReference,
    archivedThreshold,
    firestore,
    eventEmitter
  ) {
    super();
    this.tagDataCollectionReference = tagDataCollectionReference;
    this.archivedThreshold = archivedThreshold;
    this.firestore = firestore;
    this.eventEmitter = eventEmitter;
    const { ALGOLIA_APPLICATION_ID, ALGOLIA_API_KEY, ALGOLIA_INDEX_NAME } =
      process.env;
    // https://www.algolia.com/doc/api-client/getting-started/instantiate-client-index/#initialize-an-index
    // If we want to test, we need to create new index
    // https://www.algolia.com/doc/faq/accounts-billing/can-i-test-my-implementation-in-a-sandbox-environment/
    if (ALGOLIA_APPLICATION_ID && ALGOLIA_API_KEY && ALGOLIA_INDEX_NAME) {
      /** @type import('algoliasearch').SearchIndex */
      this.algoliaIndexClient = algoliasearch(
        ALGOLIA_APPLICATION_ID,
        ALGOLIA_API_KEY
      ).initIndex(ALGOLIA_INDEX_NAME);
    }

    // Register deleted event to delete corresponding object on algolia.
    // It's ok to use aysnc in the callback function of eventemitter, https://stackoverflow.com/a/47448778
    this.eventEmitter.on('algolia_object_delete', async tagId => {
      // tagId is the corresponding objectID in the algolia index.
      await this.algoliaIndexClient.deleteObject(tagId);
    });
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

  /**
   * Return data list from collection `tagData`
   * @param {PageParams} pageParams
   * @returns {Promise<TagPage>}
   */
  async getAllUnarchivedTags(pageParams) {
    const query = this.tagDataCollectionReference
      .where('archived', '==', false)
      .orderBy('lastUpdateTime', 'desc');
    const { data: tags, pageInfo } = await getPage(
      query,
      pageParams,
      this.tagDataCollectionReference
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
  async getTagData({ tagId }) {
    const doc = await this.tagDataCollectionReference.doc(tagId).get();
    if (!doc.exists) {
      return null;
    }
    return getIdWithDataFromDocSnap(doc);
  }

  /**
   * Get status history of current tag document `status` collection
   * @param {object} param
   * @param {string} param.tagId The tadId of the document we want to get the latest
   *   status
   * @param {PageParams} param.pageParams
   * @returns {Promise<StatusPage>} The status data list from new to old
   */
  async getStatusHistory({ tagId, pageParams }) {
    const docRef = this.tagDataCollectionReference.doc(tagId);

    const query = await docRef
      .collection('status')
      .orderBy('createTime', 'desc');

    const { data: statusList, pageInfo } = await getPage(
      query,
      pageParams,
      docRef.collection('status')
    );

    return { statusList, ...pageInfo };
  }

  /**
   * Get user's latest upvote status to specific tag.
   * @param {object} param
   * @param {string} param.tagId the id of the tag document we want to update
   *  status
   * @param {DecodedUserInfoFromAuthHeader} param.userInfo used
   *  to check user login status
   * @return {Promise<Status>} the latest status data
   */
  async getLatestStatusData({ tagId, userInfo }) {
    const tagDocRef = this.tagDataCollectionReference.doc(tagId);

    const { statusDocRef, ...latestStatusData } = await getLatestStatus(
      tagDocRef
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
      // if this task is not 問題任務, return `hasUpVote` with null
      const { numberOfUpVote } = latestStatusData;
      hasUpVote =
        numberOfUpVote !== null ? tagStatusUpVoteUserSnap.exists : null;
    }

    return {
      ...latestStatusData,
      hasUpVote,
    };
  }

  /**
   * Add tag data to collection `tagData` in firestore
   * @async
   * @param {string} action "add" or "update", the action of the tagData operation
   * @param {object} params
   * @param {string} params.tagId
   * @param {AddTagDataInput | UpdateTagDataInput} params.data contain the necessary filed should
   *  be added to tagData document
   * @param {DecodedUserInfoFromAuthHeader} params.userInfo The uid of the user who initiate the action
   * @returns {Promise<RawTagDocumentFields>}
   */
  // TODO: refactor this function
  async addorUpdateTagDataToFirestore(action, { tagId = '', data, userInfo }) {
    const { description, statusName } = data;
    const tagData = generateTagDataToStoreInFirestore(action, data, userInfo);

    if (action === 'add') {
      // add tagData to server
      const refAfterTagAdd = await this.tagDataCollectionReference.add(tagData);
      const { id: newAddedTagId } = refAfterTagAdd;

      await this.updateTagStatus({
        tagId: newAddedTagId,
        statusName,
        description,
        userInfo,
      });

      // send data to algolia index for searching
      if (this.algoliaIndexClient) {
        const { locationName, category } = tagData;
        // https://www.algolia.com/doc/guides/sending-and-managing-data/send-and-update-your-data/how-to/incremental-updates/?client=javascript#adding-records
        await this.algoliaIndexClient.saveObjects([
          {
            objectID: newAddedTagId,
            locationName,
            category,
            statusName,
          },
        ]);
      }

      return getIdWithDataFromDocSnap(await refAfterTagAdd.get());
    }
    if (action === 'update') {
      const refOfUpdateTag = this.tagDataCollectionReference.doc(tagId);

      // the category has changed, need to push new status data to status history
      // TODO: consider if this section is needed.
      if (Object.prototype.hasOwnProperty.call(tagData, 'category')) {
        // add tag default status, need to use original CollectionReference
        if (!statusName) {
          throw Error(
            'You need to provide statusName if you want to change category'
          );
        }
        await this.updateTagStatus({
          tagId,
          statusName,
          description: description || '(修改任務內容)',
          userInfo,
        });
      }

      // update tagData to server
      await refOfUpdateTag.update(tagData);

      // send data to algolia index for searching
      if (this.algoliaIndexClient) {
        const { locationName, category } = tagData;
        // https://www.algolia.com/doc/guides/sending-and-managing-data/send-and-update-your-data/how-to/incremental-updates/?client=javascript#updating-a-subset-of-the-record
        await this.algoliaIndexClient.partialUpdateObjects([
          {
            objectID: tagId,
            ...(locationName ? { locationName } : {}),
            ...(category ? { category } : {}),
            statusName,
          },
        ]);
      }

      return getIdWithDataFromDocSnap(await refOfUpdateTag.get());
    }

    throw Error('Undefined action of tagData operation.');
  }

  // TODO: refactor this function. Extract the verification process
  // to resolver
  /**
   * Add tag data.
   * @param {object} param
   * @param {AddTagDataInput} param.data `AddNewTagDataInput` data
   * @param {DecodedUserInfoFromAuthHeader} param.userInfo have `uid` properity which specify
   *  the uid of the user.
   * @return {Promise<AddorUpdateTagResponse>} Contain the upload tag information, and image
   *  related information
   */
  async addNewTagData({ data, userInfo }) {
    // check user status
    const { logIn } = userInfo;
    checkUserLogIn(logIn);
    // add tagData to firestore
    const tag = await this.addorUpdateTagDataToFirestore('add', {
      data,
      userInfo,
    });

    const { imageUploadNumber } = data;
    return {
      tag,
      imageUploadNumber,
    };
  }

  /**
   * Update tag data.
   * @param {object} params
   * @param {string} params.tagId
   * @param {UpdateTagDataInput} params.data `AddNewTagDataInput` data
   * @param {DecodedUserInfoFromAuthHeader} params.userInfo Have `uid` properity
   *  which specify the uid of the user.
   * @return {Promise<AddorUpdateTagResponse>} Updated tag data
   */
  async updateTagData({ tagId, data, userInfo }) {
    // check user status
    const { logIn, uid } = userInfo;
    checkUserLogIn(logIn);

    // check if the user is the creater of the tag
    const tagCreateUserId = (
      await this.tagDataCollectionReference.doc(tagId).get()
    ).data().createUserId;

    if (tagCreateUserId !== uid) {
      throw Error('This user can not update this tag');
    }

    // add tagData to firestore
    const tag = await this.addorUpdateTagDataToFirestore('update', {
      tagId,
      data,
      userInfo,
    });

    return {
      tag,
    };
  }

  /**
   * Insert latest status to the history
   * @param {object} params
   * @param {string} params.tagId the id of the tag document we want to update
   *  status
   * @param {string} params.statusName the latest status name we want to update
   * @param {string} params.description
   * @param {DecodedUserInfoFromAuthHeader} params.userInfo
   * @return {Promise<Status>} the latest status data
   */
  async updateTagStatus({ tagId, statusName, description, userInfo }) {
    const { logIn, uid } = userInfo;
    checkUserLogIn(logIn);
    const hasNumberOfUpVote = statusName === '已解決';
    const statusData = {
      statusName,
      description,
      createTime: FieldValue.serverTimestamp(),
      createUserId: uid,
      numberOfUpVote: hasNumberOfUpVote ? 0 : null,
    };
    const docRef = await this.tagDataCollectionReference
      .doc(tagId)
      .collection('status')
      .add(statusData);

    // also update the field `lastUpdateTime` in the tag
    await this.tagDataCollectionReference
      .doc(tagId)
      .update({ lastUpdateTime: FieldValue.serverTimestamp() });

    return (await docRef.get()).data();
  }

  /**
   * Update user's upvote status to specific tag. Update the numberOfUpVote and
   * record the user has upvoted.
   * @param {object} params
   * @param {string} params.tagId the id of the tag document we want to update
   *  status
   * @param {string} params.action upvote or cancel upvote
   * @param {DecodedUserInfoFromAuthHeader} params.userInfo
   * @return {Promise<Status>} the latest status data
   */
  async updateNumberOfUpVote({ tagId, action, userInfo }) {
    const { logIn, uid } = userInfo;
    checkUserLogIn(logIn);
    const tagDocRef = this.tagDataCollectionReference.doc(tagId);

    const { statusDocRef: tagStatusDocRef } = await getLatestStatus(tagDocRef);
    // if there is no status or the numberOfUpVote is null, raise error
    if (!tagStatusDocRef) {
      throw Error('No status in this tag.');
    }

    const tagStatusUpVoteUserRef = tagStatusDocRef
      .collection('UpVoteUser')
      .doc(uid);

    const transactionResult = await this.firestore.runTransaction(async t => {
      const tagStatusUpVoteUserSnap = await t.get(tagStatusUpVoteUserRef);
      const { numberOfUpVote } = (await tagStatusDocRef.get()).data();
      if (numberOfUpVote == null) {
        throw Error('No need to use NumberOfUpVote in this status.');
      }
      if (action === upVoteActionName && !tagStatusUpVoteUserSnap.exists) {
        t.update(tagStatusDocRef, {
          numberOfUpVote: numberOfUpVote + 1,
        });
        t.set(tagStatusUpVoteUserRef, { hasUpVote: true });
        return {
          tagId,
          numberOfUpVote: numberOfUpVote + 1,
          hasUpVote: true,
        };
      }
      if (action === cancelUpVoteActionName && tagStatusUpVoteUserSnap.exists) {
        t.update(tagStatusDocRef, {
          numberOfUpVote: numberOfUpVote - 1,
        });
        t.delete(tagStatusUpVoteUserRef);
        return {
          tagId,
          numberOfUpVote: numberOfUpVote - 1,
          hasUpVote: false,
        };
      }

      throw Error('Error happened when udpate numberOfUpVote');
    });

    const { numberOfUpVote } = transactionResult;

    await this.checkIfNeedArchived(tagId, numberOfUpVote);

    return transactionResult;
  }

  /**
   * Archive tag if its numberOfUpVote exceed threshold
   * @param {String} tagId
   * @param {Number} numberOfUpVote
   * @return {firebase.default.firestore.DocumentReference}
   */
  async checkIfNeedArchived(tagId, numberOfUpVote) {
    const { category } = await this.getTagData({ tagId });
    const { missionName } = category;

    if (
      missionName === '問題任務' &&
      numberOfUpVote > (await this.archivedThreshold)
    ) {
      const docRef = this.tagDataCollectionReference.doc(tagId);
      // archived tag
      await docRef.update({ archived: true });

      // event: archived
      const idWithResultData = getIdWithDataFromDocSnap(await docRef.get());
      await this.triggerEvent('archived', idWithResultData);
    }
  }

  /**
   * Increment the tag view count when a valid user clicks and see the tag.
   * @param {String} tagId the tag we want to increment viewCount.
   * @param {DecodedUserInfoFromAuthHeader} userInfo check if the user is valid.
   * @returns {boolean} Indicate suceess or not and return to the graphql
   *  mutation operation
   */
  async incrementTagViewCount(tagId, userInfo) {
    // check if it is a valid user.
    const { logIn } = userInfo;
    checkUserLogIn(logIn);

    const tagDocRef = this.tagDataCollectionReference.doc(tagId);

    // if the increment action speed is slow, try use "distributed counter"
    // https://firebase.google.com/docs/firestore/solutions/counters
    await tagDocRef.update(
      // use this sentinel values to set viewCount without transaction.
      { viewCount: FieldValue.increment(1) }
    );
    return true;
  }

  /**
   * Return tag data list from collection `tagData` created by the specific user
   * @param {object} param
   * @param {string} param.uid User id of the specific user.
   * @param {PageParams} param.pageParams
   * @returns {Promise<TagPage>}
   */
  async getUserAddTagHistory({ uid, pageParams }) {
    const query = this.tagDataCollectionReference
      .where('createUserId', '==', uid)
      .orderBy('createTime', 'desc');
    const { data: tags, pageInfo } = await getPage(
      query,
      pageParams,
      this.tagDataCollectionReference
    );

    return { tags, ...pageInfo };
  }

  /**
   *
   * @param {string} eventName
   * @param {RawTagDocumentFields} tagData
   */
  async triggerEvent(eventName, tagData) {
    this.eventEmitter.emit(eventName, tagData);
  }
} // class TagDataSource

module.exports = TagDataSource;
