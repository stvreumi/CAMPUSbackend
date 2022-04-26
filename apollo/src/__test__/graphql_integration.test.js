/**
 * @jest-environment node
 */
const firebase = require('@firebase/rules-unit-testing');
// used for test firestore timestamp instance
const { Timestamp, FieldValue } = require('firebase-admin').firestore;
const { createTestClient } = require('apollo-server-testing');
const gql = require('graphql-tag');

/** @type {import('pino').Logger} */
const logger = require('pino-caller')(require('../../logger'));

const apolloServer = require('./apolloTestServer');
const { getLatestStatus } = require('../datasources/firebaseUtils');

const {
  tagDataCollectionName,
} = require('../datasources/firestoreCollections');

/**
 * How to use available test function(for memory refresh)
 * * Use `generateGraphQLHelper` to generate helper for graphql query or
 *    mutation.
 * * `addFakeDataToFirestore`: add fake data into firestore emulator
 * * `addTestAccountToAuthEmulator`: register fake account into firebase auth
 *    emulator.
 */

// manual mock
// https://jestjs.io/docs/manual-mocks#mocking-node-modules
jest.mock('@google-cloud/pubsub');

const {
  fakeTagData,
  mockFirebaseAdmin,
  addFakeDataToFirestore,
  fakeUserRecord,
  clearFirestoreDatabase,
  clearAllAuthAccounts,
  addTestAccountToAuthEmulator,
} = require('./testUtils');

/**
 * @typedef {import('../types').DataSources} DataSources
 */

const testProjectId = 'smartcampus-1b31f-graphql-test';

const timestampStringRegex = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}\+08:00/;

/**
 *
 * @param {*} type
 * @param {*} testClient
 * @returns {mutationResponse: objct,mutationResult: object}
 */
function generateGraphQLHelper(type, testClient) {
  if (type === 'query') {
    return async (queryString, queryFieldName, variables = {}) => {
      const queryResult = await testClient({
        query: queryString,
        variables,
      });
      return {
        queryResponse: queryResult,
        queryResult: queryResult.data[queryFieldName],
      };
    };
  }
  if (type === 'mutation') {
    return async (mutateString, mutateFieldName, variables = {}) => {
      const mutateResult = await testClient({
        mutation: mutateString,
        variables,
      });
      try {
        return {
          mutationResponse: mutateResult,
          mutationResult: mutateResult.data[mutateFieldName],
        };
      } catch (e) {
        logger.error(e);
        return { mutationResponse: mutateResult };
      }
    };
  }
  return undefined;
}

const testPaginate = async (
  query,
  queryName,
  testFiledPath,
  graphQLQueryHelper,
  params = {}
) => {
  // https://stackoverflow.com/a/43849204
  const getListValueByPath = (path, obj) =>
    path.split('.').reduce((parentObj, key) => parentObj[key] || null, obj);
  const getCusrsorValueByPath = (path, obj) =>
    path
      .split('.')
      .slice(0, -1)
      .reduce((parentObj, key) => parentObj[key] || null, obj);
  const lastCursor = await [3, 7].reduce(async (cursor, pageSize) => {
    // the last return value by async function is a Prmoise, need to resolve
    const cursorResolve = await cursor;
    const { queryResult } = await graphQLQueryHelper(query, queryName, {
      pageParams: {
        pageSize,
        cursor: cursorResolve,
      },
      ...params,
    });

    expect(getListValueByPath(testFiledPath, queryResult)).toHaveLength(
      pageSize
    );
    return getCusrsorValueByPath(testFiledPath, queryResult).cursor;
  }, '');

  const { queryResult: queryExpectEmptyResult } = await graphQLQueryHelper(
    query,
    queryName,
    {
      pageParams: {
        cursor: lastCursor,
      },
      ...params,
    }
  );

  expect(
    getListValueByPath(testFiledPath, queryExpectEmptyResult)
  ).toHaveLength(0);
  expect(
    getCusrsorValueByPath(testFiledPath, queryExpectEmptyResult).empty
  ).toBeTruthy();
};

describe('test graphql query', () => {
  /** @type {import('firebase-admin').firestore.Firestore}*/
  let firestore;
  let fakeTagId;
  let graphQLQueryHelper;
  let userInfoAfterAccountCreated;
  let mutateClient;
  beforeAll(async () => {
    await clearAllAuthAccounts(testProjectId);
    // set up firebase admin
    const admin = mockFirebaseAdmin(testProjectId);
    const uid = await addTestAccountToAuthEmulator(admin.auth());
    userInfoAfterAccountCreated = { uid, logIn: true };

    // set up apollo server and test client
    const server = apolloServer({
      admin,
      userInfo: userInfoAfterAccountCreated,
    });
    const { query, mutate } = createTestClient(server);
    mutateClient = mutate;

    // set up firestore instance
    firestore = admin.firestore();

    // query helper
    graphQLQueryHelper = generateGraphQLHelper('query', query);
  });
  afterAll(async () => {
    await Promise.all(firebase.apps().map(app => app.delete()));
    await clearAllAuthAccounts(testProjectId);
  });
  beforeEach(async () => {
    await clearFirestoreDatabase(testProjectId);

    // add data
    const response = await addFakeDataToFirestore(mutateClient);
    fakeTagId = response.tag.id;
  });

  test('test query unarchivedTagList, but is not 問題回報', async () => {
    const queryUnarchivedTagList = gql`
      query {
        unarchivedTagList {
          tags {
            id
            locationName
            category {
              missionName
              subTypeName
              targetName
            }
            coordinates {
              latitude
              longitude
            }
            status {
              statusName
              createTime
              numberOfUpVote
              hasUpVote
            }
            statusHistory {
              statusList {
                statusName
                createTime
                numberOfUpVote
                hasUpVote
              }
              cursor
              empty
            }
            floor
            archived
          }
          cursor
          empty
        }
      }
    `;
    const { queryResult } = await graphQLQueryHelper(
      queryUnarchivedTagList,
      'unarchivedTagList'
    );
    expect(queryResult.tags).toEqual(expect.any(Array));
    // console.log(tagRenderListResult);
    expect(queryResult.tags[0]).toMatchObject({
      id: expect.any(String),
      locationName: fakeTagData.locationName,
      category: {
        missionName: expect.any(String),
        subTypeName: expect.any(String),
        targetName: expect.any(String),
      },
      coordinates: {
        latitude: expect.any(String),
        longitude: expect.any(String),
      },
      status: {
        statusName: expect.any(String),
        createTime: expect.stringMatching(timestampStringRegex),
        numberOfUpVote: null,
        hasUpVote: null,
      },
      statusHistory: {
        statusList: [
          {
            statusName: expect.any(String),
            createTime: expect.stringMatching(timestampStringRegex),
            numberOfUpVote: null,
            hasUpVote: null,
          },
        ],
      },
      floor: expect.any(Number),
      archived: false,
    });
  });
  test('test query fix tag', async () => {
    const defaultStatus = {
      statusName: '非常不壅擠',
      description: '',
      createTime: FieldValue.serverTimestamp(),
      createUserId: 'admin',
      numberOfUpVote: null,
    };
    // add fix tag data to firestore
    const docData = {
      locationName: '第二餐廳',
      coordinates: {
        latitude: '24.789345225611136',
        longitude: '120.99719144686011',
      },
      viewCount: 0,
    };
    const docRef = await firestore.collection('fixedTag').add(docData);

    const collectionRef = firestore.collection('fixedTagSubLocation');
    const storeData = {
      type: 'restaurant-store',
      name: 'Subway',
      floor: '1F',
      fixedTagId: docRef.id,
    };
    const storeDocRef = await collectionRef.add(storeData);
    await storeDocRef.collection('status').add(defaultStatus);
    const floorData = {
      type: 'floor',
      floor: '1F',
      fixedTagId: docRef.id,
    };
    const floorDocRef = await collectionRef.add(floorData);
    await floorDocRef.collection('status').add(defaultStatus);

    const querFixedTagList = gql`
      query {
        fixedTagList {
          fixedTags {
            id
            locationName
            coordinates {
              latitude
              longitude
            }
            viewCount
            fixedTagSubLocations {
              __typename
              ... on FixedTagPlace {
                id
                fixedTagId
                type
                floor
                name
                status {
                  statusName
                  createTime
                  type
                }
                statusHistory {
                  statusList {
                    statusName
                    createTime
                    type
                  }
                  empty
                }
              }
              ... on FixedTagFloor {
                id
                fixedTagId
                type
                floor
                status {
                  statusName
                  createTime
                  type
                }
                statusHistory {
                  statusList {
                    statusName
                    createTime
                    type
                  }
                  empty
                }
              }
            }
          }
          cursor
          empty
        }
      }
    `;
    const { queryResult } = await graphQLQueryHelper(
      querFixedTagList,
      'fixedTagList'
    );
    const statusExpectData = {
      statusName: '非常不壅擠',
      createTime: expect.stringMatching(timestampStringRegex),
      type: 'fixedTagSubLocation',
    };
    logger.debug(queryResult.fixedTags);

    // test
    expect(queryResult.fixedTags[0]).toHaveProperty('id', docRef.id);
    expect(queryResult.fixedTags[0]).toHaveProperty(
      'locationName',
      docData.locationName
    );
    expect(queryResult.fixedTags[0]).toHaveProperty(
      'coordinates',
      docData.coordinates
    );
    expect(queryResult.fixedTags[0]).toHaveProperty(
      'viewCount',
      docData.viewCount
    );
    const fixedTagSubLocationsResult = {};
    queryResult.fixedTags[0].fixedTagSubLocations.forEach(location => {
      fixedTagSubLocationsResult[location.id] = location;
    });
    expect(fixedTagSubLocationsResult[storeDocRef.id]).toMatchObject({
      ...storeData,
      id: storeDocRef.id,
      __typename: 'FixedTagPlace',
      fixedTagId: docRef.id,
      status: statusExpectData,
      statusHistory: {
        statusList: [statusExpectData],
      },
    });
    expect(fixedTagSubLocationsResult[floorDocRef.id]).toMatchObject({
      ...floorData,
      id: floorDocRef.id,
      __typename: 'FixedTagFloor',
      fixedTagId: docRef.id,
      status: statusExpectData,
      statusHistory: {
        statusList: [statusExpectData],
      },
    });

    // also test one fixed tag query
    const queryFiexdTag = gql`
      query testQueryFixedTag($id: ID!) {
        fixedTag(fixedTagId: $id) {
          id
          locationName
        }
      }
    `;
    const { queryResult: queryOneFixedTagResult } = await graphQLQueryHelper(
      queryFiexdTag,
      'fixedTag',
      { id: docRef.id }
    );

    logger.debug(queryOneFixedTagResult);
    expect(queryOneFixedTagResult).toMatchObject({
      id: docRef.id,
      locationName: docData.locationName,
    });
  });
  test('test query tag', async () => {
    const queryTag = gql`
      query testQueryTag($id: ID!) {
        tag(tagId: $id) {
          id
          createTime
          lastUpdateTime
          createUser {
            uid
            displayName
          }
          imageUrl
          floor
          viewCount
        }
      }
    `;
    const { queryResult } = await graphQLQueryHelper(queryTag, 'tag', {
      id: fakeTagId,
    });

    expect(queryResult).toMatchObject({
      id: fakeTagId,
      createTime: expect.stringMatching(timestampStringRegex),
      lastUpdateTime: expect.stringMatching(timestampStringRegex),
      createUser: {
        uid: userInfoAfterAccountCreated.uid,
        displayName: fakeUserRecord.displayName,
      },
      imageUrl: [expect.any(String)],
      floor: expect.any(Number),
      viewCount: 0,
    });
  });
  test('test query tag with 問題回報, which has information about numberOfUpVote and hasUpVote', async () => {
    const response = await addFakeDataToFirestore(mutateClient, true);
    const tagId = response.tag.id;
    const queryTag = gql`
      query testQueryTag($id: ID!) {
        tag(tagId: $id) {
          status {
            statusName
            createTime
            numberOfUpVote
            hasUpVote
          }
          statusHistory {
            statusList {
              statusName
              createTime
              numberOfUpVote
              hasUpVote
              type
            }
            cursor
            empty
          }
        }
      }
    `;
    const { queryResult } = await graphQLQueryHelper(queryTag, 'tag', {
      id: tagId,
    });

    expect(queryResult.status).toMatchObject({
      statusName: expect.any(String),
      createTime: expect.stringMatching(timestampStringRegex),
      numberOfUpVote: expect.any(Number),
      hasUpVote: expect.any(Boolean),
    });
    expect(queryResult.statusHistory.statusList[0]).toMatchObject({
      statusName: expect.any(String),
      type: 'tag',
      createTime: expect.stringMatching(timestampStringRegex),
      numberOfUpVote: expect.any(Number),
      hasUpVote: null,
    });
  });
  test('test query userAddTagHistory', async () => {
    const { uid } = userInfoAfterAccountCreated;
    const queryUserAddTagHistory = gql`
      query testQueryUserAddTagHistory($uid: ID!) {
        userAddTagHistory(uid: $uid) {
          tags {
            id
            createUser {
              uid
            }
            imageUrl
          }
          cursor
          empty
        }
      }
    `;

    const { queryResult } = await graphQLQueryHelper(
      queryUserAddTagHistory,
      'userAddTagHistory',
      { uid }
    );

    expect(queryResult.tags).toEqual(expect.any(Array));
    expect(queryResult.tags[0]).toMatchObject({
      id: fakeTagId,
      createUser: {
        uid: userInfoAfterAccountCreated.uid,
      },
      imageUrl: [expect.any(String)],
    });
  });
  test('test archived threshold number query', async () => {
    // first add threshold into firestore
    const testThreshold = 3;
    await firestore
      .collection('setting')
      .doc('tag')
      .set({ archivedThreshold: testThreshold });

    const archivedThreshold = gql`
      query archivedThreshold {
        archivedThreshold
      }
    `;

    const { queryResult } = await graphQLQueryHelper(
      archivedThreshold,
      'archivedThreshold'
    );

    expect(queryResult).toBe(testThreshold);
  });
  test('test get user data', async () => {
    const { uid } = userInfoAfterAccountCreated;
    const getUserData = gql`
      query testGetUserData($uid: ID!) {
        getUserData(uid: $uid) {
          uid
          displayName
          photoURL
          email
          userAddTagNumber
        }
      }
    `;
    const { queryResult } = await graphQLQueryHelper(
      getUserData,
      'getUserData',
      { uid }
    );
    expect(queryResult).toMatchObject({
      uid,
      displayName: fakeUserRecord.displayName,
      photoURL: fakeUserRecord.photoURL,
      email: fakeUserRecord.email,
      userAddTagNumber: 1,
    });
  });
});

/**
 ***********************************************************
 *
 * test mutate and paginate function
 *
 ***********************************************************
 */

describe('test graphql mutate and paginate function', () => {
  let graphQLQueryHelper;
  let graphQLMutationHelper;
  /** @type {import('firebase-admin').firestore} */
  let firestore;
  let userInfoAfterAccountCreated;
  let mutateClient;
  beforeAll(async () => {
    await clearAllAuthAccounts(testProjectId);
    // set up firebase admin
    const admin = mockFirebaseAdmin(testProjectId);
    const uid = await addTestAccountToAuthEmulator(admin.auth());
    userInfoAfterAccountCreated = { uid, logIn: true };

    // set up apollo server and test client
    const server = apolloServer({
      admin,
      userInfo: userInfoAfterAccountCreated,
    });
    const { mutate, query } = createTestClient(server);
    mutateClient = mutate;
    graphQLQueryHelper = generateGraphQLHelper('query', query);
    graphQLMutationHelper = generateGraphQLHelper('mutation', mutate);

    // set up fake data to firestore
    firestore = admin.firestore();
  });
  afterAll(async () => {
    await Promise.all(firebase.apps().map(app => app.delete()));
    await clearAllAuthAccounts(testProjectId);
  });
  beforeEach(async () => {
    await clearFirestoreDatabase(testProjectId);
  });

  test('test add tag data', async () => {
    const mutateTag = gql`
      mutation tagAddTest($data: addTagDataInput!) {
        addNewTagData(data: $data) {
          tag {
            id
            locationName
            category {
              missionName
              subTypeName
              targetName
            }
            floor
            status {
              statusName
              type
            }
          }
          imageUploadNumber
          imageUploadUrls
        }
      }
    `;
    const data = {
      ...fakeTagData,
      coordinates: {
        latitude: fakeTagData.coordinates.latitude,
        longitude: fakeTagData.coordinates.longitude,
      },
    };

    const { mutationResult } = await graphQLMutationHelper(
      mutateTag,
      'addNewTagData',
      {
        data,
      }
    );
    expect(mutationResult).toMatchObject({
      tag: {
        id: expect.any(String),
        locationName: data.locationName,
        floor: expect.any(Number),
        status: {
          statusName: data.statusName,
          type: 'tag',
        },
      },
      imageUploadNumber: data.imageUploadNumber,
      imageUploadUrls: expect.any(Array),
    });
    expect(mutationResult.imageUploadUrls.length).toEqual(
      data.imageUploadNumber
    );

    // test user history record
    const { uid } = userInfoAfterAccountCreated;
    // console.log(mutationResult.tag.id);
    const querySnapshot = await firestore
      .collection('userActivity')
      .where('userId', '==', uid)
      .limit(1)
      .get();
    querySnapshot.forEach(doc => {
      const docData = doc.data();
      expect(docData).toMatchObject({
        action: 'addTag',
        userId: uid,
        tagId: mutationResult.tag.id,
        createTime: expect.any(Timestamp),
      });
    });
  });

  test('test update tag data', async () => {
    const mutateTag = gql`
      mutation tagUpdateTest($tagId: ID!, $data: updateTagDataInput!) {
        updateTagData(tagId: $tagId, data: $data) {
          tag {
            id
            locationName
            status {
              statusName
            }
          }
          imageUploadNumber
          imageUploadUrls
          imageDeleteStatus
        }
      }
    `;

    // change field
    const data = {
      category: {
        missionName: '動態回報',
      },
      statusName: '人少',
    };

    // first add data to firestore
    const addFakeDataResponse = await addFakeDataToFirestore(mutateClient);
    const fakeTagId = addFakeDataResponse.tag.id;

    const { mutationResult } = await graphQLMutationHelper(
      mutateTag,
      'updateTagData',
      {
        tagId: fakeTagId,
        data,
      }
    );

    // console.log(tagUpdateTestResult.tag);
    expect(mutationResult.tag).toMatchObject({
      id: expect.any(String),
      locationName: fakeTagData.locationName, // remain unchanged
      status: {
        statusName: '人少',
      },
    });
    expect(mutationResult.imageUploadNumber).toBe(0);
    expect(mutationResult.imageUploadUrls.length).toBe(0);
    expect(mutationResult.imageDeleteStatus).toBe(null);
  });

  test('test update tag status', async () => {
    const response = await addFakeDataToFirestore(mutateClient);
    const fakeTagId = response.tag.id;

    const testStatusName = '資訊有誤';

    const mutateTag = gql`
      mutation tagUpdateTest(
        $tagId: ID!
        $statusName: String!
        $description: String
      ) {
        updateTagStatus(
          tagId: $tagId
          statusName: $statusName
          description: $description
        ) {
          statusName
          type
          createTime
          description
          numberOfUpVote
        }
      }
    `;

    const { mutationResult } = await graphQLMutationHelper(
      mutateTag,
      'updateTagStatus',
      {
        tagId: fakeTagId,
        statusName: testStatusName,
        description: 'test update status',
      }
    );

    // console.log(responseData);
    expect(mutationResult).toMatchObject({
      statusName: testStatusName,
      type: 'tag',
      createTime: expect.stringMatching(timestampStringRegex),
      description: 'test update status',
      numberOfUpVote: null,
    });

    // test if the status update mutation would work
    const queryUnarchivedTagList = gql`
      query {
        unarchivedTagList {
          tags {
            id
            status {
              statusName
              createTime
            }
            statusHistory {
              statusList {
                statusName
                createTime
              }
              cursor
              empty
            }
          }
          cursor
          empty
        }
      }
    `;
    const { queryResult } = await graphQLQueryHelper(
      queryUnarchivedTagList,
      'unarchivedTagList'
    );

    expect(queryResult.tags[0].statusHistory.statusList).toHaveLength(2);
    expect(queryResult.tags[0].status.statusName).toEqual(testStatusName);
  });
  test('test update fixed tag subLocation status', async () => {
    const defaultStatus = {
      statusName: '非常不壅擠',
      description: '',
      createTime: FieldValue.serverTimestamp(),
      createUserId: 'admin',
      numberOfUpVote: null,
    };
    // add fix tag data to firestore
    const docData = {
      locationName: '第二餐廳',
      coordinates: {
        latitude: '24.789345225611136',
        longitude: '120.99719144686011',
      },
      viewCount: 0,
    };
    const docRef = await firestore.collection('fixedTag').add(docData);

    const storeData = {
      type: 'restaurant-store',
      name: 'Subway',
      floor: '1F',
      fixedTagId: docRef.id,
    };
    const storeDocRef = await firestore
      .collection('fixedTagSubLocation')
      .add(storeData);
    await storeDocRef.collection('status').add(defaultStatus);

    const mutateTag = gql`
      mutation statusUpdateTest(
        $fixedTagSubLocationId: ID!
        $statusName: String!
        $description: String
      ) {
        updateFixedTagSubLocationStatus(
          fixedTagSubLocationId: $fixedTagSubLocationId
          statusName: $statusName
          description: $description
        ) {
          status {
            statusName
            createTime
            description
            numberOfUpVote
            type
          }
        }
      }
    `;

    const testStatusName = '普通';
    const { mutationResult } = await graphQLMutationHelper(
      mutateTag,
      'updateFixedTagSubLocationStatus',
      {
        fixedTagSubLocationId: storeDocRef.id,
        statusName: testStatusName,
        description: 'test update status',
      }
    );
    logger.debug(mutationResult);

    expect(mutationResult.status).toMatchObject({
      statusName: testStatusName,
      createTime: expect.stringMatching(timestampStringRegex),
      description: 'test update status',
      numberOfUpVote: null,
      type: 'fixedTagSubLocation',
    });
  });

  test('test `updateUpVoteStatus` and upvote related query', async () => {
    const response = await addFakeDataToFirestore(mutateClient, true);

    // upvote
    const mutateTag = gql`
      mutation upVoteTest($tagId: ID!, $action: updateUpVoteAction!) {
        updateUpVoteStatus(tagId: $tagId, action: $action) {
          tagId
          numberOfUpVote
          hasUpVote
        }
      }
    `;

    const { mutationResult } = await graphQLMutationHelper(
      mutateTag,
      'updateUpVoteStatus',
      {
        tagId: response.tag.id,
        action: 'UPVOTE',
      }
    );

    expect(mutationResult).toMatchObject({
      tagId: response.tag.id,
      numberOfUpVote: 1,
      hasUpVote: true,
    });

    // test if query can get the upvote number
    const queryStatusTag = gql`
      query testQueryTag($id: ID!) {
        tag(tagId: $id) {
          status {
            statusName
            createTime
            numberOfUpVote
            hasUpVote
          }
        }
      }
    `;

    const { queryResult } = await graphQLQueryHelper(queryStatusTag, 'tag', {
      id: response.tag.id,
    });
    // console.log(queryResult.data.tag);
    expect(queryResult.status).toMatchObject({
      statusName: '已解決',
      createTime: expect.stringMatching(timestampStringRegex),
      numberOfUpVote: 1,
      hasUpVote: true,
    });

    // cancel upvote
    const cancelMutateTag = gql`
      mutation upVoteTest($tagId: ID!, $action: updateUpVoteAction!) {
        updateUpVoteStatus(tagId: $tagId, action: $action) {
          tagId
          numberOfUpVote
          hasUpVote
        }
      }
    `;

    const { mutationResult: cancelMutationResult } =
      await graphQLMutationHelper(cancelMutateTag, 'updateUpVoteStatus', {
        tagId: response.tag.id,
        action: 'CANCEL_UPVOTE',
      });
    expect(cancelMutationResult).toMatchObject({
      tagId: response.tag.id,
      numberOfUpVote: 0,
      hasUpVote: false,
    });

    // test if query can get the upvote number
    const queryCancelStatusTag = gql`
      query testQueryTag($id: ID!) {
        tag(tagId: $id) {
          status {
            statusName
            createTime
            numberOfUpVote
            hasUpVote
          }
        }
      }
    `;
    const { queryResult: cancelQueryResult } = await graphQLQueryHelper(
      queryCancelStatusTag,
      'tag',
      {
        id: response.tag.id,
      }
    );
    expect(cancelQueryResult.status).toMatchObject({
      statusName: '已解決',
      createTime: expect.stringMatching(timestampStringRegex),
      numberOfUpVote: 0,
      hasUpVote: false,
    });
  });
  test('test update tag status and check if it can update numberOfUpVote', async () => {
    const response = await addFakeDataToFirestore(mutateClient, true);
    const fakeTagId = response.tag.id;
    const testStatusName = '已解決';

    const mutateTag = gql`
      mutation tagUpdateTest(
        $tagId: ID!
        $statusName: String!
        $description: String
        $hasNumberOfUpVote: Boolean
      ) {
        updateTagStatus(
          tagId: $tagId
          statusName: $statusName
          description: $description
          hasNumberOfUpVote: $hasNumberOfUpVote
        ) {
          statusName
          createTime
          description
          numberOfUpVote
          type
        }
      }
    `;

    const { mutationResult } = await graphQLMutationHelper(
      mutateTag,
      'updateTagStatus',
      {
        tagId: fakeTagId,
        statusName: testStatusName,
        description: 'test update status',
        hasNumberOfUpVote: true,
      }
    );

    // console.log(responseData);
    expect(mutationResult).toMatchObject({
      statusName: testStatusName,
      createTime: expect.stringMatching(timestampStringRegex),
      description: 'test update status',
      numberOfUpVote: 0,
      type: 'tag',
    });

    // upvote
    const upVoteOfMutateTag = gql`
      mutation upVoteTest($tagId: ID!, $action: updateUpVoteAction!) {
        updateUpVoteStatus(tagId: $tagId, action: $action) {
          tagId
          numberOfUpVote
          hasUpVote
        }
      }
    `;

    const { mutationResult: upVoteMutationResult } =
      await graphQLMutationHelper(upVoteOfMutateTag, 'updateUpVoteStatus', {
        tagId: fakeTagId,
        action: 'UPVOTE',
      });

    expect(upVoteMutationResult).toMatchObject({
      tagId: fakeTagId,
      numberOfUpVote: 1,
      hasUpVote: true,
    });
  });
  test('test get and set hasReadGuide', async () => {
    const queryHasReadGuide = async () => {
      const queryHasReadGuideQL = gql`
        query {
          hasReadGuide
        }
      `;

      const { queryResult } = await graphQLQueryHelper(
        queryHasReadGuideQL,
        'hasReadGuide'
      );
      return queryResult;
    };

    expect(await queryHasReadGuide()).toBe(false);

    const mutateSetHasReadGuide = gql`
      mutation {
        setHasReadGuide
      }
    `;

    const { mutationResult } = await graphQLMutationHelper(
      mutateSetHasReadGuide,
      'setHasReadGuide'
    );
    // console.log(mutateSetHasReadGuideResult);

    // check if mutation successed
    expect(mutationResult).toBe(true);

    // check if the setHasReadGuide success
    expect(await queryHasReadGuide()).toBe(true);
  });
  test('test update tag: upload new image and delete exist image', async () => {
    const response = await addFakeDataToFirestore(mutateClient);
    const fakeTagId = response.tag.id;

    const updateImageMutation = gql`
      mutation upVoteTest($tagId: ID!, $data: updateTagDataInput!) {
        updateTagData(tagId: $tagId, data: $data) {
          tag {
            id
          }
          imageUploadUrls
          imageDeleteStatus
        }
      }
    `;

    // prepare update data
    const imageDeleteUrls = [
      `https://storage.googleapis.com/download/storage/v1/b/smartcampus-1b31f.appspot.com/o/${fakeTagId}%2F40109ead-0bc5-43a1-8e99-d118df339517.jpg?generation=1607929899797089&alt=media`,
    ];
    const imageUploadNumber = 2;

    const { mutationResult } = await graphQLMutationHelper(
      updateImageMutation,
      'updateTagData',
      {
        tagId: fakeTagId,
        data: {
          imageDeleteUrls,
          imageUploadNumber,
        },
      }
    );
    // console.log(updateImageMutationResult);
    expect(mutationResult).toMatchObject({
      tag: { id: fakeTagId },
      imageDeleteStatus: true,
    });
    expect(mutationResult.imageUploadUrls.length).toBe(imageUploadNumber);
  });
  test('test archived mechanism', async () => {
    const testThreshold = 3;
    // first add threshold into firestore
    await firestore
      .collection('setting')
      .doc('tag')
      .set({ archivedThreshold: testThreshold });

    // add 問題回報 tag
    const response = await addFakeDataToFirestore(mutateClient, true);
    const tagId = response.tag.id;

    // set numberOfUpVote to 3
    const { statusDocRef } = await getLatestStatus(
      firestore
        .collection(tagDataCollectionName)
        .doc(tagId)
        .collection('status')
    );
    await statusDocRef.update({ numberOfUpVote: testThreshold });

    // upvote
    const upvoteTag = gql`
      mutation upVoteTest($tagId: ID!, $action: updateUpVoteAction!) {
        updateUpVoteStatus(tagId: $tagId, action: $action) {
          numberOfUpVote
        }
      }
    `;

    const { mutationResult } = await graphQLMutationHelper(
      upvoteTag,
      'updateUpVoteStatus',
      {
        tagId,
        action: 'UPVOTE',
      }
    );

    expect(mutationResult).toMatchObject({
      numberOfUpVote: testThreshold + 1,
    });

    // test if the tag has been archived
    const archivedTag = gql`
      query archivedTag($tagId: ID!) {
        tag(tagId: $tagId) {
          archived
        }
      }
    `;
    const { queryResult } = await graphQLQueryHelper(archivedTag, 'tag', {
      tagId,
    });

    expect(queryResult).toMatchObject({
      archived: true,
    });
  });
  test('test incrementViewCount', async () => {
    // There would be an `addTag` record when creating fake data.
    const response = await addFakeDataToFirestore(mutateClient);
    const fakeTagId = response.tag.id;

    const incrementViewCountMutation = gql`
      mutation incrementViewCountTest($tagId: ID!) {
        incrementViewCount(tagId: $tagId)
      }
    `;

    const { mutationResult } = await graphQLMutationHelper(
      incrementViewCountMutation,
      'incrementViewCount',
      {
        tagId: fakeTagId,
      }
    );

    expect(mutationResult).toBeTruthy();

    const queryViewCount = gql`
      query testQueryViewCount($id: ID!) {
        tag(tagId: $id) {
          viewCount
        }
      }
    `;

    const { queryResult } = await graphQLQueryHelper(queryViewCount, 'tag', {
      id: fakeTagId,
    });

    expect(queryResult).toMatchObject({ viewCount: 1 });

    // test user history record
    const { uid } = userInfoAfterAccountCreated;
    const querySnapshot = await firestore
      .collection('userActivity')
      .where('action', '==', 'viewTag')
      .limit(1)
      .get();
    querySnapshot.forEach(doc => {
      const docData = doc.data();
      expect(docData).toMatchObject({
        action: 'viewTag',
        userId: uid,
        tagId: fakeTagId,
        createTime: expect.any(Timestamp),
      });
    });
  });
  test('test unarchivedTagList with paginate function', async () => {
    // add many tag into firestore
    await Promise.all(
      [...new Array(10)].map(() => addFakeDataToFirestore(mutateClient))
    );

    // unarchived tag list
    const queryUnarchivedTagList = gql`
      query tags($pageParams: PageParams) {
        unarchivedTagList(pageParams: $pageParams) {
          tags {
            id
          }
          cursor
          empty
        }
      }
    `;

    await testPaginate(
      queryUnarchivedTagList,
      'unarchivedTagList',
      'tags',
      graphQLQueryHelper
    );

    // user add tag history
    const queryUserAddTagHistory = gql`
      query testQueryUserAddTagHistory($uid: ID!, $pageParams: PageParams) {
        userAddTagHistory(uid: $uid, pageParams: $pageParams) {
          tags {
            id
          }
          cursor
          empty
        }
      }
    `;
    await testPaginate(
      queryUserAddTagHistory,
      'userAddTagHistory',
      'tags',
      graphQLQueryHelper,
      {
        uid: userInfoAfterAccountCreated.uid,
      }
    );
  });
  test('test status paginate function', async () => {
    const response = await addFakeDataToFirestore(mutateClient);
    const testTagId = response.tag.id;

    const testStatusName = 'test';

    const mutateTag = gql`
      mutation tagUpdateTest(
        $tagId: ID!
        $statusName: String!
        $description: String
      ) {
        updateTagStatus(
          tagId: $tagId
          statusName: $statusName
          description: $description
        ) {
          statusName
          createTime
          description
        }
      }
    `;
    // update status multiple times
    // there already has been a status(default)
    await Promise.all(
      [...new Array(9)].map(() =>
        graphQLMutationHelper(mutateTag, 'updateTagStatus', {
          tagId: testTagId,
          statusName: testStatusName,
          description: 'test update status',
        })
      )
    );

    // test if the status update mutation would work
    const queryTag = gql`
      query testStatusHistoryWithPaginate(
        $tagId: ID!
        $pageParams: PageParams
      ) {
        tag(tagId: $tagId) {
          statusHistory(pageParams: $pageParams) {
            statusList {
              id
            }
            cursor
            empty
          }
        }
      }
    `;
    await testPaginate(
      queryTag,
      'tag',
      'statusHistory.statusList',
      graphQLQueryHelper,
      {
        tagId: testTagId,
      }
    );
  });
  test('test delete tagData by create user', async () => {
    const response = await addFakeDataToFirestore(mutateClient);
    const testTagId = response.tag.id;

    const mutate = gql`
      mutation testDeleteTagDataByCreateUser($tagId: ID!) {
        deleteTagDataByCreateUser(tagId: $tagId)
      }
    `;

    const { mutationResult } = await graphQLMutationHelper(
      mutate,
      'deleteTagDataByCreateUser',
      {
        tagId: testTagId,
      }
    );

    expect(mutationResult).toBeTruthy();

    // test if the tag really be deleted
    const tagSnap = await firestore
      .collection(tagDataCollectionName)
      .doc(testTagId)
      .get();

    expect(tagSnap.exists).toBeFalsy();
  });
  test('test delete tagData by user which not create the tag', async () => {
    const response = await addFakeDataToFirestore(mutateClient);
    const testTagId = response.tag.id;

    // directly modify createUser id in the firestore
    await firestore
      .collection(tagDataCollectionName)
      .doc(testTagId)
      .update({ createUserId: 'just-want-to-be-different' });

    const mutate = gql`
      mutation testDeleteTagDataByCreateUser($tagId: ID!) {
        deleteTagDataByCreateUser(tagId: $tagId)
      }
    `;

    const { mutationResponse } = await graphQLMutationHelper(
      mutate,
      'deleteTagDataByCreateUser',
      {
        tagId: testTagId,
      }
    );

    expect(mutationResponse.errors[0].message).toBe(
      'This user can not delete this tag'
    );
  });
});
