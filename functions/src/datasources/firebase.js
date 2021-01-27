/** @module Firebase */
const { DataSource } = require('apollo-datasource');
const { AuthenticationError } = require('apollo-server-express');
// geofirestore
const { GeoFirestore } = require('geofirestore');
// firebaseUtil
const {
  generateFileName,
  getDataFromTagDocRef,
  getLatestStatus,
  getIntentFromDocRef,
  checkUserLogIn,
} = require('./firebaseUtils');

const { upVoteActionName, cancelUpVoteActionName } = require('./constants');

/** Handle action with firebase
 *  @todo Rewrite this class name
 *  @todo refactor
 */
class FirebaseAPI extends DataSource {
  /**
   * Use admin to construct necessary entity of communication
   * @param {object} param
   * @param {object} param.admin firebase admin config
   */
  constructor({ admin }) {
    super();

    // Create a GeoFirestore reference
    this.admin = admin;
    this.firestore = admin.firestore();
    this.geofirestore = new GeoFirestore(this.firestore);

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
   * @async
   * @param {object} - request
   * @returns {DecodedIdToken} - have `uid` properity which specify
   *  the uid of the user.
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
   * @param {uid} the uid of the user
   * @returns {string} user's name of the uid
   */
  async getUserName({ uid }) {
    try {
      const { displayName, email } = await this.auth.getUser(uid);
      return { displayName, email };
    } catch (error) {
      console.log('Error fetching user data:', error);
      return null;
    }
  }

  /** *** storage *** */

  /**
   * Get image urls of specific tag
   * @param {object} param
   * @param {string} param.tagId the ID of the tag
   * @returns {string[]} the image links of the current tag
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
   * @param {Int} imageUploadNumber
   * @param {String} tagId
   * @returns {Promise[]} an array contain singed urls with length `imageNumber`
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
   * Get all objects from specific collection.
   * @async
   * @param {string} collectionName Collection name of firestore.
   * @returns {object[]} Array of document data in the collection `collectionName`
   */
  async getList(collectionName) {
    const list = [];
    const querySnapshot = await this.firestore.collection(collectionName).get();
    querySnapshot.forEach(doc => {
      const data = doc.data();
      list.push({
        id: doc.id,
        ...data,
      });
    });
    return list;
  }

  /**
   * Return data list from collection `tagData`
   * (Geofirestore `d` field is removed from verson 4)
   * @async
   * @returns {object} Data with id
   */
  async getTagList() {
    const list = [];
    const querySnapshot = await this.firestore.collection('tagData').get();
    querySnapshot.forEach(doc => {
      list.push(getDataFromTagDocRef(doc.ref));
    });
    return Promise.all(list);
  }

  /**
   * Return data list from collection `tagData` of the specific user
   * @async
   * @param {object} param
   * @param {string} param.uid User id of the specific user.
   * @returns {object} Data with id
   */
  async getUserAddTagHistory({ uid }) {
    const list = [];
    const querySnapshot = await this.firestore
      .collection('tagData')
      .where('createUserId', '==', uid)
      .orderBy('createTime', 'desc')
      .get();
    querySnapshot.forEach(doc => {
      list.push(getDataFromTagDocRef(doc.ref));
    });
    return Promise.all(list);
  }

  /**
   * get tag detail from collection `tag_detail`
   * @async
   * @param {object} param
   * @param {string} param.tagId tagId of the document with detailed info.
   * @returns {object|null} Object of document data in collection `tagDetail`
   */
  async getTagData({ id }) {
    const doc = await this.firestore.collection('tagData').doc(id).get();
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
   * @param {DocumentReference} docRef The document we want to get the latest
   *   status
   */
  async getStatusHistory({ tagId }) {
    const docRef = await this.firestore.collection('tagData').doc(tagId);
    const statusDocSnap = await docRef
      .collection('status')
      .orderBy('createTime', 'desc')
      .get();
    const statusRes = [];
    statusDocSnap.forEach(doc => {
      statusRes.push(doc.data());
    });
    return statusRes;
  }

  /**
   * get the answer of the user's question
   * @param {String} param.userintent the intent that user's question meaning
   */
  async getAnswer(userintent) {
    const intentRef = await this.firestore.collection('intent');
    let queryIntent;
    const querySnapshot = await intentRef
      .where('userintent', '==', userintent)
      .get();
    querySnapshot.forEach(doc => {
      queryIntent = doc.data();
    });
    return queryIntent.useranswer;
  }

  /**
   * Get user's latest upvote status to specific tag.
   * @param {object} param
   * @param {String} param.tagId the id of the tag document we want to update
   *  status
   * @return {Integer} the latest status data
   */
  async getLatestStatusData({ tagId, userInfo }) {
    const { uid } = userInfo;
    const tagDocRef = this.firestore.collection('tagData').doc(tagId);

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
   * @param {object} param.userInfo upvote or cancel upvote
   * @return {Boolean} Return the status of hasReadGuide. `true` means that
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
   * @param {object} data
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
   * @param {*} tagDocRef
   * @param {string} missionName
   * @param {string} description
   * @param {string} uid
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
   * @param {String} action "add" or "update", the action of the tagData operation
   * @param {object} param
   * @param {object} param.tagData contain the necessary filed should
   *  be added to tagData document
   * @param {object} param.uid The uid of the user who initiate the action
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

      return getDataFromTagDocRef(refAfterTagAdd.native);
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

      return getDataFromTagDocRef(refOfUpdateTag.native);
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
   * @param {AddNewTagDataInputObject} param.data `AddNewTagDataInput` data
   * @param {DecodedIdToken} param.me have `uid` properity which specify
   *  the uid of the user.
   * @return {AddNewTagResponse} Contain the upload tag information, and image
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
   * @param {object} param
   * @param {AddNewTagDataInputObject} param.data `AddNewTagDataInput` data
   * @param {DecodedIdToken} param.me Have `uid` properity which specify
   *  the uid of the user.
   * @return {Tag} Updated tag data
   */
  async updateTagData({ tagId, data, userInfo }) {
    // check user status
    const { logIn, uid } = userInfo;
    checkUserLogIn(logIn);

    // check if the user is the creater of the tag
    const tagCreateUserId = (
      await this.firestore.collection('tagData').doc(tagId).get()
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
   * @param {object} param
   * @param {String} param.tagId the id of the tag document we want to update
   *  status
   * @param {String} param.statusName the latest status name we want to update
   * @return {object} the latest status data
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
   * @param {object} param
   * @param {String} param.tagId the id of the tag document we want to update
   *  status
   * @param {String} param.action upvote or cancel upvote
   * @return {object} the latest status data
   */
  async updateNumberOfUpVote({ tagId, action, userInfo }) {
    const { logIn, uid } = userInfo;
    checkUserLogIn(logIn);
    const tagDocRef = this.firestore.collection('tagData').doc(tagId);

    const { statusDocRef: tagStatusDocRef } = await getLatestStatus(tagDocRef);
    // if there is no status or the numberOfUpVote is null, raise error
    if (!tagStatusDocRef) {
      throw Error('No status in this tag.');
    }

    const tagStatusUpVoteUserRef = tagStatusDocRef
      .collection('UpVoteUser')
      .doc(uid);

    return this.firestore.runTransaction(async t => {
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
  }

  /**
   * Record if the user(judge by token) has read the guide.
   * @param {object} param
   * @param {object} param.userInfo upvote or cancel upvote
   * @return {Boolean} Return the status of set hasReadGuide. `true` is success.
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

  /**
   * Add user's FAQ or some other question and answer
   * @param {String} param.userintent
   * @param {String} param.useranswer
   */
  async addNewIntent({ data }) {
    const { userintent, useranswer } = data;
    const intentRef = await this.firestore.collection('intent');
    let retData;
    await intentRef
      .add({
        userintent,
        useranswer,
      })
      .then(docRef => {
        retData = getIntentFromDocRef(intentRef.doc(docRef.id));
        console.log(`finish add new intent`);
      })
      .catch(error => {
        console.error('error add document: ', error);
      });
    return retData;
  }

  /**
   * Add user's question to certain intent
   * @param {String} param.userintent
   * @param {String} param.userquestion
   */
  async addNewQuestion(data) {
    const { userintent, userquestion } = data;
    const intentRef = await this.firestore.collection('intent');
    const querySnapshot = await intentRef
      .where('userintent', '==', userintent)
      .get();

    let docRef;
    querySnapshot.forEach(doc => {
      docRef = doc._ref;
    });

    docRef
      .collection('questions')
      .where('userquestion', '==', userquestion)
      .get()
      .then(async question => {
        let _doc;
        question.forEach(doc => {
          _doc = doc;
        });
        if (_doc.data().userquestion === userquestion) {
          console.log(`the question '${userquestion}' has been asked before `);
          question.forEach(async _question => {
            const questionaskedtimes = _question.data().questionaskedtimes + 1;
            await _question._ref
              .set({
                userquestion,
                questionaskedtimes,
              })
              .then(() => {
                console.log(`finish modify the question times`);
              })
              .catch(error => {
                console.error(error);
              });
          });
        } else {
          console.log(`add new question '${userquestion}'...`);
          await docRef
            .collection('questions')
            .add({
              userquestion,
              questionaskedtimes: 1,
            })
            .then(() => {
              console.log(
                `finish add the question to the intent '${userintent}'`
              );
            })
            .catch(error => {
              console.error(error);
            });
        }
      });
  }
} // class FirebaseAPI

module.exports = FirebaseAPI;
