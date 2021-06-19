/** @module TagDataSource */
const { DataSource } = require('apollo-datasource');
const { FieldValue, FieldPath } = require('firebase-admin').firestore;

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
   */
  constructor(tagDataCollectionReference, archivedThreshold, firestore) {
    super();

    this.tagDataCollectionReference = tagDataCollectionReference;
    this.archivedThreshold = archivedThreshold;
    this.firestore = firestore;
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
      .orderBy('lastUpdateTime', 'desc')
      .orderBy(FieldPath.documentId());
    const { data: tags, pageInfo } = await getPage(query, pageParams);
    return { tags, ...pageInfo };
  }

  /**
   * get tag detail from collection `tag_detail`
   * @async
   * @param {object} param
   * @param {string} param.id tagId of the document with detailed info.
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
    const docRef = await this.tagDataCollectionReference.doc(tagId);

    const query = await docRef
      .collection('status')
      .orderBy('createTime', 'desc')
      .orderBy(FieldPath.documentId());

    const { data: statusList, pageInfo } = await getPage(query, pageParams);

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
    const { uid } = userInfo;
    const tagDocRef = this.tagDataCollectionReference.doc(tagId);

    const { statusDocRef, ...latestStatusData } = await getLatestStatus(
      tagDocRef
    );

    // if there is no status or the numberOfUpVote is null, raise error
    if (!statusDocRef) {
      throw Error('No status in this tag.');
    }

    // check if user has upvote
    const tagStatusUpVoteUserRef = statusDocRef
      .collection('UpVoteUser')
      .doc(uid);
    const tagStatusUpVoteUserSnap = await tagStatusUpVoteUserRef.get();

    // if this task is not 問題任務, return `hasUpVote` with null
    const { numberOfUpVote } = latestStatusData;
    return {
      ...latestStatusData,
      hasUpVote:
        numberOfUpVote !== null ? tagStatusUpVoteUserSnap.exists : null,
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

      // add tag default status, need to use original CollectionReference
      const { id: newAddedTagId } = refAfterTagAdd;
      const { missionName } = data.category;
      await this.updateTagStatus({
        tagId: newAddedTagId,
        statusName,
        description,
        userInfo,
        hasNumberOfUpVote: missionName === '問題任務',
      });

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
        const { missionName } = data.category;
        await this.updateTagStatus({
          tagId,
          statusName,
          description: '(修改任務內容)',
          userInfo,
          hasNumberOfUpVote: missionName === '問題任務',
        });
      }

      // update tagData to server
      await refOfUpdateTag.update(tagData);

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
   * @param {boolean} params.hasNumberOfUpVote
   * @return {Promise<Status>} the latest status data
   */
  async updateTagStatus({
    tagId,
    statusName,
    description,
    userInfo,
    hasNumberOfUpVote = false,
  }) {
    const { logIn, uid } = userInfo;
    checkUserLogIn(logIn);

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
      // archived tag
      await this.tagDataCollectionReference
        .doc(tagId)
        .update({ archived: true });
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
      .orderBy('createTime', 'desc')
      .orderBy(FieldPath.documentId());
    const { data: tags, pageInfo } = await getPage(query, pageParams);

    return { tags, ...pageInfo };
  }
} // class TagDataSource

module.exports = TagDataSource;
