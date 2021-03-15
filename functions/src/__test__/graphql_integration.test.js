/**
 * @jest-environment node
 */
const firebase = require('@firebase/testing');
const { createTestClient } = require('apollo-server-testing');
const gql = require('graphql-tag');

const apolloServer = require('./apolloTestServer');
const FirebaseAPI = require('../datasources/firebase');
const { getLatestStatus } = require('../datasources/firebaseUtils');
const {
  fakeTagData,
  mockFirebaseAdmin,
  addFakeDataToFirestore,
  fakeUserInfo,
  clearFirestoreDatabase,
} = require('./testUtils');

const testProjectId = 'smartcampus-1b31f-graphql-test';

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
      return {
        mutationResponse: mutateResult,
        mutationResult: mutateResult.data[mutateFieldName],
      };
    };
  }
  return undefined;
}

describe('test graphql query', () => {
  let firebaseAPIinstance;
  let firestore;
  let fakeTagId;
  let graphQLQueryHelper;
  beforeAll(async () => {
    // set up firebase admin
    const admin = mockFirebaseAdmin(testProjectId);
    firebaseAPIinstance = new FirebaseAPI({ admin });

    // set up apollo server and test client
    const server = apolloServer({ admin, logIn: true });
    const { query } = createTestClient(server);

    // set up firestore instance
    firestore = admin.firestore();

    // query helper
    graphQLQueryHelper = generateGraphQLHelper('query', query);
  });
  afterAll(async () => {
    await Promise.all(firebase.apps().map(app => app.delete()));
  });
  beforeEach(async () => {
    await clearFirestoreDatabase(testProjectId);

    // add data
    const response = await addFakeDataToFirestore(firebaseAPIinstance);
    fakeTagId = response.tag.id;
  });

  test('test query unarchivedTagList, but is not 問題任務', async () => {
    const queryUnarchivedTagList = gql`
      query {
        unarchivedTagList {
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
            statusName
            createTime
            numberOfUpVote
            hasUpVote
          }
          floor
          archived
        }
      }
    `;
    const { queryResult } = await graphQLQueryHelper(
      queryUnarchivedTagList,
      'unarchivedTagList'
    );
    expect(queryResult).toEqual(expect.any(Array));
    // console.log(tagRenderListResult);
    expect(queryResult[0]).toMatchObject({
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
        createTime: expect.any(String),
        numberOfUpVote: null,
        hasUpVote: null,
      },
      statusHistory: [
        {
          statusName: expect.any(String),
          createTime: expect.any(String),
          numberOfUpVote: null,
          hasUpVote: null,
        },
      ],
      floor: expect.any(Number),
      archived: false,
    });
  });

  test('test query tag', async () => {
    const queryTag = gql`
      query testQueyTag($id: ID!) {
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
        }
      }
    `;
    const { queryResult } = await graphQLQueryHelper(queryTag, 'tag', {
      id: fakeTagId,
    });
    expect(queryResult).toMatchObject({
      id: fakeTagId,
      createTime: expect.any(String),
      lastUpdateTime: expect.any(String),
      createUser: {
        uid: fakeUserInfo.uid,
        displayName: fakeUserInfo.displayName,
      },
      imageUrl: [expect.any(String)],
      floor: expect.any(Number),
    });
    const tagInFirestore = (
      await firestore.collection('tagData').doc(fakeTagId).get()
    ).data();
    // console.log(dataInFirestore);
    expect(tagInFirestore).toMatchObject({
      createTime: expect.any(firebase.firestore.Timestamp),
      lastUpdateTime: expect.any(firebase.firestore.Timestamp),
    });
  });
  test('test query tag with 問題任務, which has information about numberOfUpVote and hasUpVote', async () => {
    const response = await addFakeDataToFirestore(firebaseAPIinstance, true);
    const tagId = response.tag.id;
    const queryTag = gql`
      query testQueyTag($id: ID!) {
        tag(tagId: $id) {
          status {
            statusName
            createTime
            numberOfUpVote
            hasUpVote
          }
          statusHistory {
            statusName
            createTime
            numberOfUpVote
            hasUpVote
          }
        }
      }
    `;
    const { queryResult } = await graphQLQueryHelper(queryTag, 'tag', {
      id: tagId,
    });

    expect(queryResult.status).toMatchObject({
      statusName: expect.any(String),
      createTime: expect.any(String),
      numberOfUpVote: expect.any(Number),
      hasUpVote: expect.any(Boolean),
    });
    expect(queryResult.statusHistory[0]).toMatchObject({
      statusName: expect.any(String),
      createTime: expect.any(String),
      numberOfUpVote: expect.any(Number),
      hasUpVote: null,
    });
  });
  test('test query userAddTagHistory', async () => {
    const { uid } = fakeUserInfo;
    const queryUserAddTagHistory = gql`
      query testQueyUserAddTagHistory($uid: ID!) {
        userAddTagHistory(uid: $uid) {
          id
          createUser {
            uid
          }
          imageUrl
        }
      }
    `;

    const { queryResult } = await graphQLQueryHelper(
      queryUserAddTagHistory,
      'userAddTagHistory',
      { uid }
    );

    expect(queryResult).toEqual(expect.any(Array));
    expect(queryResult[0]).toMatchObject({
      id: fakeTagId,
      createUser: {
        uid: fakeUserInfo.uid,
      },
      imageUrl: [expect.any(String)],
    });
  });
  test('test archived threshold number query', async () => {
    // TODO: don't konw how to test this, since the realtime update need to take
    // some time after we update the field value in the firestore, so the result
    // of the graphql doesn't change.
    // first add threshold into firestore
    const testThreshold = 3;
    await firestore
      .collection('setting')
      .doc('tag')
      .set({ archivedThreshold: testThreshold });

    const data = await firestore.collection('setting').doc('tag').get();
    console.log(data.data);

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
});

describe('test graphql mutate', () => {
  let graphQLQueryHelper;
  let graphQLMutationHelper;
  let firestore;
  let firebaseAPIinstance;
  beforeAll(() => {
    // set up firebase admin
    const admin = mockFirebaseAdmin(testProjectId);
    firebaseAPIinstance = new FirebaseAPI({ admin });

    // set up apollo server and test client
    const server = apolloServer({ admin, logIn: true });
    const { mutate, query } = createTestClient(server);
    graphQLQueryHelper = generateGraphQLHelper('query', query);
    graphQLMutationHelper = generateGraphQLHelper('mutation', mutate);

    // set up fake data to firestore
    firestore = admin.firestore();
  });
  afterAll(async () => {
    await Promise.all(firebase.apps().map(app => app.delete()));
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
          }
          imageUploadNumber
          imageUploadUrls
        }
      }
    `;
    const data = {
      ...fakeTagData,
      coordinates: {
        latitude: fakeTagData.coordinatesString.latitude,
        longitude: fakeTagData.coordinatesString.longitude,
      },
    };
    delete data.status;
    delete data.coordinatesString;

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
      },
      imageUploadNumber: data.imageUploadNumber,
      imageUploadUrls: expect.any(Array),
    });
    expect(mutationResult.imageUploadUrls.length).toEqual(
      data.imageUploadNumber
    );

    // check detail collection data directly from firestore
    const detailDocData = (
      await firestore.collection('tagData').doc(mutationResult.tag.id).get()
    ).data();
    // console.log(detailDoc);
    expect(detailDocData).toMatchObject({
      createTime: expect.any(firebase.firestore.Timestamp),
      lastUpdateTime: expect.any(firebase.firestore.Timestamp),
      streetViewInfo: fakeTagData.streetViewInfo,
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
        missionName: '動態任務',
      },
    };

    // first add data to firestore
    const addFakeDataResponse = await addFakeDataToFirestore(
      firebaseAPIinstance
    );
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
    const response = await addFakeDataToFirestore(firebaseAPIinstance);
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
          createTime
          description
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
      createTime: expect.any(String),
      description: 'test update status',
    });

    // test if the status update mutation would work
    const queryUnarchivedTagList = gql`
      query {
        unarchivedTagList {
          id
          status {
            statusName
            createTime
          }
          statusHistory {
            statusName
            createTime
          }
        }
      }
    `;
    const { queryResult } = await graphQLQueryHelper(
      queryUnarchivedTagList,
      'unarchivedTagList'
    );

    // console.log(tagRenderListResult[0].statusHistory);

    expect(queryResult[0].statusHistory).toHaveLength(2);
    expect(queryResult[0].status.statusName).toEqual(testStatusName);
  });
  test('test `updateUpVoteStatus` and upvote related query', async () => {
    const response = await addFakeDataToFirestore(firebaseAPIinstance, true);

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
      query testQueyTag($id: ID!) {
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
      statusName: '待處理',
      createTime: expect.any(String),
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

    const {
      mutationResult: cancelMutationResult,
    } = await graphQLMutationHelper(cancelMutateTag, 'updateUpVoteStatus', {
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
      query testQueyTag($id: ID!) {
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
      statusName: '待處理',
      createTime: expect.any(String),
      numberOfUpVote: 0,
      hasUpVote: false,
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
    const response = await addFakeDataToFirestore(firebaseAPIinstance);
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

    // add 問題任務 tag
    const response = await addFakeDataToFirestore(firebaseAPIinstance, true);
    const tagId = response.tag.id;

    // set numberOfUpVote to 3
    const { statusDocRef } = await getLatestStatus(
      firestore.collection('tagData').doc(tagId)
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
});
