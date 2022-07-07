/** @module TagDataSource */
const { DataSource } = require('apollo-datasource');
const { FieldValue } = require('firebase-admin').firestore;

/** @type {import('pino').Logger} */
const logger = require('pino-caller')(require('../../logger'));

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
class TagDataSource extends DataSource {
  /**
   * Use admin to construct necessary entity of communication
   * @param {TagCollectionReference} tagDataCollectionRef
   * @param {CollectionReference} userActivityCollectionRef
   * @param {CollectionReference} fixedTagCollectionRef
   * @param {CollectionReference} fixedTagSubLocationCollectionRef
   * @param {number} archivedThreshold
   * @param {Firestore} firestore
   * @param {import('events').EventEmitter} eventEmitter
   * @param {import('algoliasearch').SearchIndex} algoliaIndexClient
   */
  constructor(
    tagDataCollectionRef,
    userActivityCollectionRef,
    fixedTagCollectionRef,
    fixedTagSubLocationCollectionRef,
    archivedThreshold,
    firestore,
    eventEmitter,
    algoliaIndexClient
  ) {
    super();
    this.tagDataCollectionRef = tagDataCollectionRef;
    this.userActivityCollectionRef = userActivityCollectionRef;
    this.fixedTagCollectionRef = fixedTagCollectionRef;
    this.fixedTagSubLocationCollectionRef = fixedTagSubLocationCollectionRef;
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

  /**
   * Return data list from collection `tagData`
   * @param {PageParams} pageParams
   * @returns {Promise<TagPage>}
   */
  async getAllUnarchivedTags(pageParams) {
    const query = this.tagDataCollectionRef
      .where('archived', '==', false)
      .orderBy('lastUpdateTime', 'desc');
    const { data: tags, pageInfo } = await getPage(
      query,
      pageParams,
      this.tagDataCollectionRef
    );
    return { tags, ...pageInfo };
  }

  /**
   * Return data list from collection `fixedTags`
   * @param {PageParams} pageParams
   * @returns {Promise<TagPage>}
   */
  async getAllFixedTags(pageParams) {
    // explicitly ask query ordery by the doc id
    // the orderby usage comes from here
    // https://firebase.google.com/docs/firestore/manage-data/delete-data#collections
    const query = this.fixedTagCollectionRef.orderBy('__name__');
    const { data: fixedTags, pageInfo } = await getPage(
      query,
      pageParams,
      this.fixedTagCollectionRef
    );
    return { fixedTags, ...pageInfo };
  }

  /**
   *
   * @param {string} fixedTagId
   * @returns
   */
  async getAllfixedTagSubLocation(fixedTagId) {
    logger.debug('getAllfixedTagSubLocation');
    logger.debug({ fixedTagId });
    // explicitly ask query ordery by the doc id
    // the orderby usage comes from here
    // https://firebase.google.com/docs/firestore/manage-data/delete-data#collections
    const query = this.fixedTagSubLocationCollectionRef.where(
      'fixedTagId',
      '==',
      fixedTagId
    );

    const snapshot = await query.get();
    const subLocations = [];
    snapshot.forEach(doc => subLocations.push({ ...doc.data(), id: doc.id }));
    return subLocations;
  }

  /**
   * get tag detail from collection `tag_detail`
   * @async
   * @param {object} param
   * @param {string} param.tagId tagId of the document with detailed info.
   * @returns {Promise<RawTagDocumentFields>|null}
   */
  async getTagData({ tagId }) {
    const doc = await this.tagDataCollectionRef.doc(tagId).get();
    if (!doc.exists) {
      return null;
    }
    return getIdWithDataFromDocSnap(doc);
  }

  /**
   *
   * @param {object} param
   * @param {string} param.fixedTagId
   * @returns
   */
  async getFixedTagData({ fixedTagId }) {
    const doc = await this.fixedTagCollectionRef.doc(fixedTagId).get();
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
    const docRef = this.tagDataCollectionRef.doc(tagId);

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
    const statusCollectionRef = this.tagDataCollectionRef
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

  /**
   * Get status history of current tag document `status` collection
   * @param {object} param
   * @param {string} param.subLocationId The tadId of the document we want to get the latest
   *   status
   * @param {PageParams} param.pageParams
   * @returns {Promise<StatusPage>} The status data list from new to old
   */
  async getFixedTagSubLocationStatusHistory({ subLocationId, pageParams }) {
    const statusCollectionRef = this.fixedTagSubLocationCollectionRef
      .doc(subLocationId)
      .collection('status');

    const query = await statusCollectionRef.orderBy('createTime', 'desc');

    const { data, pageInfo } = await getPage(
      query,
      pageParams,
      statusCollectionRef
    );

    const statusList = data.map(status => ({
      ...status,
      type: 'fixedTagSubLocation',
    }));

    return { statusList, ...pageInfo };
  }

  /**
   * Get user's latest upvote status to specific tag.
   * @param {object} param
   * @param {string} param.subLocationId the id of the tag document we want to update
   *  status
   * @return {Promise<Status>} the latest status data
   */
  async getFixedTagSubLocationLatestStatusData({ subLocationId }) {
    logger.debug({ subLocationId });
    const statusCollectionRef = this.fixedTagSubLocationCollectionRef
      .doc(subLocationId)
      .collection('status');
    const { statusDocRef, ...latestStatusData } = await getLatestStatus(
      statusCollectionRef
    );

    // if there is no status or the numberOfUpVote is null, raise error
    if (!statusDocRef) {
      throw Error('No status in this tag.');
    }

    return {
      ...latestStatusData,
      hasUpVote: null,
      type: 'fixedTagSubLocation',
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
      const refAfterTagAdd = await this.tagDataCollectionRef.add(tagData);
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
        const res = await this.algoliaIndexClient.saveObject({
          objectID: newAddedTagId,
          locationName,
          category,
          statusName,
        });
        console.log('algolia add object result:');
        console.dir(res);
      }

      return getIdWithDataFromDocSnap(await refAfterTagAdd.get());
    }
    if (action === 'update') {
      const refOfUpdateTag = this.tagDataCollectionRef.doc(tagId);

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
          description: description || '(修改回報內容)',
          userInfo,
        });
      }

      // update tagData to server
      await refOfUpdateTag.update(tagData);

      // send data to algolia index for searching
      if (this.algoliaIndexClient) {
        const { locationName, category } = tagData;
        // https://www.algolia.com/doc/guides/sending-and-managing-data/send-and-update-your-data/how-to/incremental-updates/?client=javascript#updating-a-subset-of-the-record
        const res = await this.algoliaIndexClient.partialUpdateObject({
          objectID: tagId,
          ...(locationName ? { locationName } : {}),
          ...(category ? { category } : {}),
          statusName,
        });
        console.log('algolia update object result:');
        console.dir(res);
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
    // check user login status
    const { logIn, uid } = userInfo;
    checkUserLogIn(logIn);

    // check if the user is the create user of the tag
    const tagCreateUserId = (
      await this.tagDataCollectionRef.doc(tagId).get()
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
    const docRef = await this.tagDataCollectionRef
      .doc(tagId)
      .collection('status')
      .add(statusData);

    // update status field in the record of algolia index
    if (this.algoliaIndexClient) {
      await this.algoliaIndexClient.partialUpdateObject({
        objectID: tagId,
        statusName,
      });
    }
    return { ...getIdWithDataFromDocSnap(await docRef.get()), type: 'tag' };
  }

  /**
   *
   * @param {object} param
   * @returns {Promise<{type: string, docPath: string}>}
   */
  async updateFixedTagSubLocationStatus({
    FixedTagSubLocationId,
    statusName,
    description,
    userInfo,
  }) {
    const { logIn, uid } = userInfo;
    checkUserLogIn(logIn);

    const statusData = {
      statusName,
      description,
      createTime: FieldValue.serverTimestamp(),
      createUserId: uid,
    };
    const docRef = await this.fixedTagSubLocationCollectionRef
      .doc(FixedTagSubLocationId)
      .collection('status')
      .add(statusData);

    // update status field in the record of algolia index
    /*
    if (this.algoliaIndexClient) {
      await this.algoliaIndexClient.partialUpdateObject({
        objectID: tagId,
        statusName,
      });
    }
    */
    return {
      ...getIdWithDataFromDocSnap(await docRef.get()),
      type: 'fixedTagSubLocation',
    };
  }

  /**
   *
   * @param {{ tagId: string, userInfo: DecodedUserInfoFromAuthHeader }} param
   * @returns {boolean}
   */
  async deleteTagDataByCreateUser({ tagId, userInfo }) {
    // the first part of this function is like `updateTagData`
    // check user login status
    const { logIn, uid } = userInfo;
    checkUserLogIn(logIn);

    // check if the user is the creater of the tag
    const tagCreateUserId = (
      await this.tagDataCollectionRef.doc(tagId).get()
    ).data().createUserId;

    if (tagCreateUserId !== uid) {
      throw Error('This user can not delete this tag');
    }

    await this.tagDataCollectionRef.doc(tagId).delete();

    return true;
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
    const statusCollectionRef = this.tagDataCollectionRef
      .doc(tagId)
      .collection('status');

    const { statusDocRef: tagStatusDocRef } = await getLatestStatus(
      statusCollectionRef
    );
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
          numberOfUpVote: numberOfUpVote + 1, // <=== must add the same number
        });
        t.set(tagStatusUpVoteUserRef, { hasUpVote: true });

        return {
          tagId,
          numberOfUpVote: numberOfUpVote + 1, // <=== must add the same number
          hasUpVote: true,
        };
      }
      if (action === cancelUpVoteActionName && tagStatusUpVoteUserSnap.exists) {
        t.update(tagStatusDocRef, {
          numberOfUpVote: numberOfUpVote - 1, // <=== must subtract the same number
        });
        t.delete(tagStatusUpVoteUserRef);

        return {
          tagId,
          numberOfUpVote: numberOfUpVote - 1, // <=== must subtract the same number
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
      missionName === '問題回報' &&
      numberOfUpVote > (await this.archivedThreshold)
    ) {
      const docRef = this.tagDataCollectionRef.doc(tagId);
      // archived tag
      await docRef.update({ archived: true });

      // event: archived
      const idWithResultData = getIdWithDataFromDocSnap(await docRef.get());
      await this.triggerEvent('archived', idWithResultData);

      // after archiving, need to delete the record in the index of algolia
      if (this.algoliaIndexClient) {
        await this.algoliaIndexClient.deleteObject(tagId);
      }
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

    const tagDocRef = this.tagDataCollectionRef.doc(tagId);

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
    const query = this.tagDataCollectionRef
      .where('createUserId', '==', uid)
      .orderBy('createTime', 'desc');
    const { data: tags, pageInfo } = await getPage(
      query,
      pageParams,
      this.tagDataCollectionRef
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

  /**
   * Record user activity(actions) on the tag.
   * It's OK not to await this function, the caller would not block on this function.
   * @param {string} action available actions:
   *  - 'addTag'
   *  - 'updateTag'
   *  - 'updateStatus'
   *  - 'viewTag'
   *  - 'upVote'
   *  - 'cancelUpVote'
   *  - 'getTags'(meaning: the first time open the web app and refresh the page)
   * @param {DecodedUserInfoFromAuthHeader} userInfo
   * @param {string | null} tagId
   */
  async recordUserActivity(action, userInfo, tagId = null) {
    const { uid: userId } = userInfo;
    await this.userActivityCollectionRef.add({
      action,
      userId,
      tagId,
      createTime: FieldValue.serverTimestamp(),
    });
  }
} // class TagDataSource

module.exports = TagDataSource;
