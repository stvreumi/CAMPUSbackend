/** @module Firebase */
const { DataSource } = require('apollo-datasource');
const { AuthenticationError } = require('apollo-server-express');
// geofirestore
const { GeoFirestore } = require('geofirestore');
// firebaseUtil
const {
  generateFileName,
  getTagDataFromTagDocSnap,
  getLatestStatus,
  checkUserLogIn,
} = require('./firebaseUtils');

const { upVoteActionName, cancelUpVoteActionName } = require('./constants');

// used for type annotation
/**
 * @typedef {import('../types').DecodedUserInfoFromAuthHeader} DecodedUserInfoFromAuthHeader
 * @typedef {import('../types').Status} Status
 * @typedef {import('../types').AddTagDataInput} AddTagDataInput
 * @typedef {import('../types').RawTagFromFirestore} RawTagFromFirestore
 * @typedef {import('../types').AddorUpdateTagResponse} AddorUpdateTagResponse
 * @typedef {import('../types').UpdateTagDataInput} UpdateTagDataInput
 */

//@ts-check
/** Handle action with firebase
 *  @todo Rewrite this class name
 *  @todo refactor
 */
class FirebaseAPI extends DataSource {
  /**
   * Use admin to construct necessary entity of communication
   * @param {object} param
   * @param {import("firebase-admin").app.App} param.admin firebase admin config
   */
  constructor({ admin }) {
    super();

    this.admin = admin;
    this.firestore = admin.firestore();
    this.geofirestore = new GeoFirestore(this.firestore);

    // frequently used firestore collection reference
    this.tagDataCollectionRef = this.firestore.collection('tagData');

    // for authentication
    this.auth = admin.auth();

    // for storage bucket
    this.bucket = admin.storage().bucket();
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
   * Authentication
   */

  /**
   * Verify token from reqeust header and return user object
   * @param {import("express").Request} req request object from express
   * @returns {Promise<DecodedUserInfoFromAuthHeader>}
   */
  async getUserInfoFromToken(req) {
    const { authorization } = req.headers;

    if (authorization) {
      const token = authorization.replace('Bearer ', '');
      try {
        // verifyIdToken return DecodedIdToken
        // https://firebase.google.com/docs/reference/admin/node/admin.auth.DecodedIdToken
        const { uid, email } = await this.auth.verifyIdToken(token);
        // getUser return UserRecord
        // https://firebase.google.com/docs/reference/admin/node/admin.auth.UserRecord
        const { displayName } = await this.auth.getUser(uid);
        return {
          logIn: true,
          uid,
          email,
          displayName: displayName || uid,
        };
      } catch (e) {
        throw new AuthenticationError(e);
      }
    }
    return {
      logIn: false,
      uid: 'anonymous',
      displayName: 'anonymous',
    };
  }

  /**
   * Get user's name from uid
   * @param {object} param
   * @param {string} param.uid the uid of the user
   * @returns {Promise<string>} user's name of the uid
   */
  async getUserName({ uid }) {
    try {
      const { displayName } = await this.auth.getUser(uid);
      return displayName;
    } catch (error) {
      throw new Error(`Error fetching user data: ${error}`);
    }
  }

  /**
   * Get user's email from uid
   * @param {object} param
   * @param {string} param.uid the uid of the user
   * @returns {Promise<string>} user's email of the uid
   */
  async getUserEmail({ uid }) {
    try {
      const { email } = await this.auth.getUser(uid);
      return email;
    } catch (error) {
      throw new Error(`Error fetching user data: ${error}`);
    }
  }

  /** *** storage *** */

  /**
   * Get image urls of specific tag
   * @param {object} param
   * @param {string} param.tagId the ID of the tag
   * @returns {Promise<string>[]} the image links of the current tag
   */
  async getImageUrls({ tagId }) {
    const options = {
      directory: tagId,
    };
    const [files] = await this.bucket.getFiles(options);

    return files.map(file => file.metadata.mediaLink);
  }

  /**
   * Generate Singed URL to let front end upload images in a tag to firebase storage
   * The file name on the storage will looks like: `tagID/(8 digits uuid)`
   * reference from: https://github.com/googleapis/nodejs-storage/blob/master/samples/generateV4UploadSignedUrl.js
   * @param {object} param
   * @param {number} param.imageUploadNumber
   * @param {string} param.tagId
   * @returns {Promise<string>[]} an array contain singed urls with length `imageNumber`
   */
  getImageUploadUrls({ imageUploadNumber, tagId }) {
    // These options will allow temporary uploading of the file with outgoing
    // Content-Type: application/octet-stream header.
    const options = {
      version: 'v4',
      action: 'write',
      expires: Date.now() + 5 * 60 * 1000, // 5 minutes
      contentType: 'application/octet-stream',
    };

    const fileNameArray = generateFileName(imageUploadNumber, tagId);

    return fileNameArray.map(async name => {
      const [url] = await this.bucket.file(name).getSignedUrl(options);
      return url;
    });
  }

  /** *** firestore *** */

  /**
   * Return data list from collection `tagData`
   * (Geofirestore `d` field is removed from verson 4)
   * @returns {Promise<RawTagFromFirestore>[]} Data array with id
   */
  async getAllTags() {
    const list = [];
    const querySnapshot = await this.tagDataCollectionRef.get();
    querySnapshot.forEach(doc => {
      list.push(getTagDataFromTagDocSnap(doc));
    });
    return Promise.all(list);
  }

  /**
   * Return tag data list from collection `tagData` created by the specific user
   * @param {object} param
   * @param {string} param.uid User id of the specific user.
   * @returns {Promise<RawTagFromFirestore>[]} Data with id
   */
  async getUserAddTagHistory({ uid }) {
    const list = [];
    const querySnapshot = await this.firestore
      .collection('tagData')
      .where('createUserId', '==', uid)
      .orderBy('createTime', 'desc')
      .get();
    querySnapshot.forEach(doc => {
      list.push(getTagDataFromTagDocSnap(doc));
    });
    return Promise.all(list);
  }

  /**
   * get tag detail from collection `tag_detail`
   * @async
   * @param {object} param
   * @param {string} param.id tagId of the document with detailed info.
   * @returns {Promise<RawTagFromFirestore>|null}
   */
  async getTagData({ tagId }) {
    const doc = await this.tagDataCollectionRef.doc(tagId).get();
    if (!doc.exists) {
      return null;
    }
    return {
      id: doc.id,
      ...doc.data(),
    };
  }

  /**
   * TODO: add paginate function
   * Get status history of current tag document `status` collection
   * @param {object} param
   * @param {string} param.tagId The tadId of the document we want to get the latest
   *   status
   * @returns {Promise<Status>[]} The status data list from new to old
   */
  async getStatusHistory({ tagId }) {
    const docRef = await this.tagDataCollectionRef.doc(tagId);
    const statusDocSnap = await docRef
      .collection('status')
      .orderBy('createTime', 'desc')
      .get();
    const statusResList = [];
    statusDocSnap.forEach(doc => {
      statusResList.push(doc.data());
    });
    return statusResList;
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
    const tagDocRef = this.tagDataCollectionRef.doc(tagId);

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
   * Get if the user(judge by token) has read the guide.
   * @param {object} param
   * @param {DecodedUserInfoFromAuthHeader} param.userInfo upvote or cancel upvote
   * @return {Promise<boolean>} Return the status of hasReadGuide. `true` means that
   *  the user has read the guide.
   */
  async getHasReadGuideStatus({ userInfo }) {
    const { logIn, uid } = userInfo;
    checkUserLogIn(logIn);

    const userHasReadGuideDocRef = this.firestore
      .collection('hasReadGuide')
      .doc(uid);

    const doc = await userHasReadGuideDocRef.get();

    if (doc.exists) {
      return true;
    }

    return false;
  }

  /**
   * Generate tag data object which stroe in the firestore from original raw data
   * @param {string} action
   * @param {AddTagDataInput} data
   * @param {Promise<string>} uid
   */
  async generateTagDataToStoreInFirestore(action, data, uid) {
    // get data which would be non-null
    const {
      locationName,
      coordinates,
      category,
      floor = null,
      streetViewInfo = null,
    } = data;
    const tagData = {
      locationName,
      category,
      coordinates: coordinates
        ? new this.admin.firestore.GeoPoint(
            parseFloat(coordinates.latitude),
            parseFloat(coordinates.longitude)
          )
        : undefined,
      // originally tagDetail
      lastUpdateTime: this.admin.firestore.FieldValue.serverTimestamp(),
      floor,
      streetViewInfo,
    };
    if (action === 'add') {
      // get data which would be nullable
      return {
        ...tagData,
        createTime: this.admin.firestore.FieldValue.serverTimestamp(),
        createUserId: uid,
      };
    }
    if (action === 'update') {
      // filter out not change data (undefined)
      return Object.keys(tagData)
        .filter(key => tagData[key] !== undefined && tagData[key] !== null)
        .reduce((obj, key) => ({ ...obj, [key]: tagData[key] }), {});
    }

    throw Error('Undefined action of tagData operation.');
  }

  /**
   *
   * @param {firebase.firestore.DocumentReference} tagDocRef
   * @param {string} missionName
   * @param {string} description
   * @param {string} uid
   * @returns {Promise<void>}
   */
  async insertDefualtStatusObjToTagDoc(
    tagDocRef,
    missionName,
    description = '',
    uid
  ) {
    const getDefaultStatus = () => {
      switch (missionName) {
        case '設施任務':
          return '存在';
        case '問題任務':
          return '待處理';
        case '動態任務':
          return '人少';
        default:
          return '';
      }
    };
    const defaultStatusData = {
      statusName: getDefaultStatus(),
      description,
      createTime: this.admin.firestore.FieldValue.serverTimestamp(),
      createUserId: uid,
      numberOfUpVote: missionName === '問題任務' ? 0 : null,
    };
    // add tag default status, need to use original CollectionReference
    await tagDocRef.collection('status').native.add(defaultStatusData);
  }

  /**
   * Add tag data to collection `tagData` in firestore
   * @async
   * @param {string} action "add" or "update", the action of the tagData operation
   * @param {object} params
   * @param {string} params.tagId
   * @param {AddTagDataInput | UpdateTagDataInput} params.data contain the necessary filed should
   *  be added to tagData document
   * @param {string} params.uid The uid of the user who initiate the action
   * @returns {Promise<RawTagFromFirestore>}
   */
  async addorUpdateTagDataToFirestore(action, { tagId = '', data, uid }) {
    const { description } = data;
    const tagData = await this.generateTagDataToStoreInFirestore(
      action,
      data,
      uid
    );

    const tagGeoRef = this.geofirestore.collection('tagData');

    if (action === 'add') {
      const { missionName } = tagData.category;
      // add tagData to server
      const refAfterTagAdd = await tagGeoRef.add(tagData);

      // add tag default status, need to use original CollectionReference
      await this.insertDefualtStatusObjToTagDoc(
        refAfterTagAdd,
        missionName,
        description,
        uid
      );

      return getTagDataFromTagDocSnap(await refAfterTagAdd.native.get());
    }
    if (action === 'update') {
      const refOfUpdateTag = tagGeoRef.doc(tagId);

      // the category has changed, need to push new status data to status history
      if (Object.prototype.hasOwnProperty.call(tagData, 'category')) {
        const { missionName } = tagData.category;
        // add tag default status, need to use original CollectionReference
        await this.insertDefualtStatusObjToTagDoc(
          refOfUpdateTag,
          missionName,
          '(修改任務內容)',
          uid
        );
      }

      // update tagData to server
      await refOfUpdateTag.update(tagData);

      return getTagDataFromTagDocSnap(await refOfUpdateTag.native.get());
    }

    throw Error('Undefined action of tagData operation.');
  }

  // TODO: if id is null, add data, else update data and udptetime
  // check if user, discovery and task id are existed
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
    const { logIn, uid } = userInfo;
    checkUserLogIn(logIn);
    // add tagData to firestore
    const tagDataDocumentData = await this.addorUpdateTagDataToFirestore(
      'add',
      {
        data,
        uid,
      }
    );

    // retrieve id of new added tag document
    const { id: tagDataDocumentId } = tagDataDocumentData;

    const { imageUploadNumber } = data;
    return {
      tag: tagDataDocumentData,
      imageUploadNumber,
      imageUploadUrls: await Promise.all(
        this.getImageUploadUrls({ imageUploadNumber, tagId: tagDataDocumentId })
      ),
    };
  } // function async addNewTagData

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
      await this.tagDataCollectionRef.doc(tagId).get()
    ).data().createUserId;

    if (tagCreateUserId !== uid) {
      throw Error('This user can not update this tag');
    }

    // add tagData to firestore
    const tagDataDocumentData = await this.addorUpdateTagDataToFirestore(
      'update',
      {
        tagId,
        data,
        uid,
      }
    );

    // image management function definition
    const doImageDelete = async imageDeleteUrls => {
      if (imageDeleteUrls) {
        const locations = imageDeleteUrls.map(url => {
          const re = /\/([\w]+)%2F([\w\-]+.jpg)/i;
          const reMatchResult = url.match(re);
          const [_, tagIdInUrl, fileNameInUrl] = reMatchResult;
          if (tagIdInUrl !== tagId) {
            throw new Error('The image you want to delete is not in this tag');
          }
          return `${tagIdInUrl}/${fileNameInUrl}`;
        });

        // delete files
        // usign Promise.allSettled to ensure all promises would be called
        const responses = await Promise.allSettled(
          locations.map(async fileLocation =>
            this.bucket.file(fileLocation).delete()
          )
        );
        const rejectedMessages = responses.filter(
          ({ status }) => status === 'rejected'
        );
        if (rejectedMessages.length > 0) {
          console.error(rejectedMessages);
          throw new Error(
            `${rejectedMessages.length} files didn't be deleted successfully`
          );
        }
        return true;
      }
      return null;
    };
    /**
     * @param {number} imageUploadNumber
     */
    const doGetImageUploadSignedUrl = async imageUploadNumber => {
      if (imageUploadNumber > 0) {
        return Promise.all(
          this.getImageUploadUrls({ imageUploadNumber, tagId })
        );
      }
      return [];
    };

    // image management
    const { imageDeleteUrls, imageUploadNumber = 0 } = data;
    return {
      tag: tagDataDocumentData,
      imageUploadNumber,
      imageUploadUrls: await doGetImageUploadSignedUrl(imageUploadNumber),
      imageDeleteStatus: await doImageDelete(imageDeleteUrls),
    };
  } // function async updateTagData

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

    const statusData = {
      statusName,
      description,
      createTime: this.admin.firestore.FieldValue.serverTimestamp(),
      createUserId: uid,
    };
    const docRef = await this.firestore
      .collection('tagData')
      .doc(tagId)
      .collection('status')
      .add(statusData);

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
    const tagDocRef = this.tagDataCollectionRef.doc(tagId);

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

    return transactionResult;
    // const { numberOfUpVote } = transactionResult;

    // TODO : add threshold condition to archive tag, need to know
    // the task is 問題任務 and the status of this tag

    // create new function called:
    // checkIfNeedArchived(tagId, numberOfUpVote)
  }

  /**
   * Record if the user(judge by token) has read the guide.
   * @param {object} params
   * @param {DecodedUserInfoFromAuthHeader} params.userInfo upvote or cancel upvote
   * @return {Promise<boolean>} Return the status of set hasReadGuide. `true` is success.
   */
  async setHasReadGuide({ userInfo }) {
    const { logIn, uid } = userInfo;
    checkUserLogIn(logIn);

    const userHasReadGuideDocRef = this.firestore
      .collection('hasReadGuide')
      .doc(uid);

    const doc = await userHasReadGuideDocRef.get();

    if (!doc.exists) {
      await userHasReadGuideDocRef.set({
        hasReadGuide: true,
      });

      return true;
    }

    return false;
  }
} // class FirebaseAPI

module.exports = FirebaseAPI;
