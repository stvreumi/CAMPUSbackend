/**
 * @jest-environment node
 */
const firebase = require('@firebase/testing');
const { createTestClient } = require('apollo-server-testing');
const gql = require('graphql-tag');

const apolloServer = require('./apolloTestServer');
const FirebaseAPI = require('../datasources/firebase');
const {
  fakeTagData,
  mockFirebaseAdmin,
  addFakeDataToFirestore,
  fakeUserInfo,
  clearFirestoreDatabase,
} = require('./testUtils');

const testProjectId = 'smartcampus-1b31f-graphql-test';

describe('test graphql query', () => {
  let queryClient;
  let firebaseAPIinstance;
  let firestore;
  let fakeTagId;
  beforeAll(async () => {
    // set up firebase admin
    const admin = mockFirebaseAdmin(testProjectId);
    firebaseAPIinstance = new FirebaseAPI({ admin });

    // set up apollo server and test client
    const server = apolloServer({ admin, logIn: true });
    const { query } = createTestClient(server);
    queryClient = query;

    // set up firestore instance
    firestore = admin.firestore();
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

  test('test query tagRenderList, but is not 問題任務', async () => {
    const queryTagRenderList = gql`
      query {
        tagRenderList {
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
        }
      }
    `;
    const result = await queryClient({ query: queryTagRenderList });
    const tagRenderListResult = result.data.tagRenderList;
    expect(tagRenderListResult).toEqual(expect.any(Array));
    // console.log(tagRenderListResult);
    expect(tagRenderListResult[0]).toMatchObject({
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
    });
  });

  test('test query tag', async () => {
    const queryTag = gql`
      query testQueyTag($id: ID!) {
        tag(id: $id) {
          id
          createTime
          lastUpdateTime
          createUser {
            uid
            displayName
          }
          description
          imageUrl
          floor
        }
      }
    `;
    const result = await queryClient({
      query: queryTag,
      variables: { id: fakeTagId },
    });
    const tagResult = result.data.tag;
    expect(tagResult).toMatchObject({
      id: fakeTagId,
      createTime: expect.any(String),
      lastUpdateTime: expect.any(String),
      createUser: {
        uid: fakeUserInfo.uid,
        displayName: fakeUserInfo.displayName,
      },
      description: expect.any(String),
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
        tag(id: $id) {
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
    const result = await queryClient({
      query: queryTag,
      variables: { id: tagId },
    });
    // NEXT
    const tagResult = result.data.tag;

    expect(tagResult.status).toMatchObject({
      statusName: expect.any(String),
      createTime: expect.any(String),
      numberOfUpVote: expect.any(Number),
      hasUpVote: expect.any(Boolean),
    });
    expect(tagResult.statusHistory[0]).toMatchObject({
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
          description
          imageUrl
        }
      }
    `;
    const result = await queryClient({
      query: queryUserAddTagHistory,
      variables: { uid },
    });
    const tagResult = result.data.userAddTagHistory;
    expect(tagResult).toEqual(expect.any(Array));
    expect(tagResult[0]).toMatchObject({
      id: fakeTagId,
      createUser: {
        uid: fakeUserInfo.uid,
      },
      description: expect.any(String),
      imageUrl: [expect.any(String)],
    });
  });
});

describe('test graphql mutate', () => {
  let mutateClient;
  let queryClient;
  let firestore;
  let firebaseAPIinstance;
  beforeAll(() => {
    // set up firebase admin
    const admin = mockFirebaseAdmin(testProjectId);
    firebaseAPIinstance = new FirebaseAPI({ admin });

    // set up apollo server and test client
    const server = apolloServer({ admin, logIn: true });
    const { mutate, query } = createTestClient(server);
    mutateClient = mutate;
    queryClient = query;

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
          imageNumber
          imageUploadUrl
        }
      }
    `;
    const data = {
      ...fakeTagData,
      coordinates: {
        latitude: fakeTagData.coordinatesString.latitude,
        longitude: fakeTagData.coordinatesString.longitude,
      },
      imageNumber: 2,
    };
    delete data.status;
    delete data.coordinatesString;
    const result = await mutateClient({
      mutation: mutateTag,
      variables: {
        data,
      },
    });
    // console.log(result.data);

    const responseData = result.data.addNewTagData;
    expect(responseData).toMatchObject({
      tag: {
        id: expect.any(String),
        locationName: data.locationName,
        floor: expect.any(Number),
      },
      imageNumber: data.imageNumber,
      imageUploadUrl: expect.any(Array),
    });
    expect(responseData.imageUploadUrl.length).toEqual(data.imageNumber);

    // check detail collection data
    const detailDocData = (
      await firestore.collection('tagData').doc(responseData.tag.id).get()
    ).data();
    // console.log(detailDoc);
    expect(detailDocData).toMatchObject({
      createTime: expect.any(firebase.firestore.Timestamp),
      lastUpdateTime: expect.any(firebase.firestore.Timestamp),
      description: fakeTagData.description,
      streetViewInfo: fakeTagData.streetViewInfo,
    });
  });

  test('test update tag data', async () => {
    const mutateTag = gql`
      mutation tagUpdateTest($tagId: ID!, $data: updateTagDataInput!) {
        updateTagData(tagId: $tagId, data: $data) {
          id
          locationName
          description
        }
      }
    `;

    // change field
    const latestDescription = 'latest changed update description';
    const data = {
      description: latestDescription,
    };

    // first add data to firestore
    const response = await addFakeDataToFirestore(firebaseAPIinstance);
    const fakeTagId = response.tag.id;

    const result = await mutateClient({
      mutation: mutateTag,
      variables: {
        tagId: fakeTagId,
        data,
      },
    });

    const responseData = result.data.updateTagData;
    expect(responseData).toMatchObject({
      id: expect.any(String),
      locationName: fakeTagData.locationName,
      description: latestDescription,
    });
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
    const result = await mutateClient({
      mutation: mutateTag,
      variables: {
        tagId: fakeTagId,
        statusName: testStatusName,
        description: 'test update status',
      },
    });
    // console.log(result.data);

    const responseData = result.data.updateTagStatus;

    // console.log(responseData);
    expect(responseData).toMatchObject({
      statusName: testStatusName,
      createTime: expect.any(String),
      description: 'test update status',
    });

    // test if the status update mutation would work
    const queryTagRenderList = gql`
      query {
        tagRenderList {
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
    const queryStatusResult = await queryClient({ query: queryTagRenderList });
    const tagRenderListResult = queryStatusResult.data.tagRenderList;

    // console.log(tagRenderListResult[0].statusHistory);

    expect(tagRenderListResult[0].statusHistory).toHaveLength(2);
    expect(tagRenderListResult[0].status.statusName).toEqual(testStatusName);
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
    const result = await mutateClient({
      mutation: mutateTag,
      variables: {
        tagId: response.tag.id,
        action: 'UPVOTE',
      },
    });

    const mutateResponse = result.data.updateUpVoteStatus;
    expect(mutateResponse).toMatchObject({
      tagId: response.tag.id,
      numberOfUpVote: 1,
      hasUpVote: true,
    });

    // test if query can get the upvote number
    const queryStatusTag = gql`
      query testQueyTag($id: ID!) {
        tag(id: $id) {
          status {
            statusName
            createTime
            numberOfUpVote
            hasUpVote
          }
        }
      }
    `;
    const queryResult = await queryClient({
      query: queryStatusTag,
      variables: {
        id: response.tag.id,
      },
    });
    // console.log(queryResult.data.tag);
    expect(queryResult.data.tag.status).toMatchObject({
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
    const cancelResult = await mutateClient({
      mutation: cancelMutateTag,
      variables: {
        tagId: response.tag.id,
        action: 'CANCEL_UPVOTE',
      },
    });

    const cancelMutateResponse = cancelResult.data.updateUpVoteStatus;
    expect(cancelMutateResponse).toMatchObject({
      tagId: response.tag.id,
      numberOfUpVote: 0,
      hasUpVote: false,
    });

    // test if query can get the upvote number
    const queryCancelStatusTag = gql`
      query testQueyTag($id: ID!) {
        tag(id: $id) {
          status {
            statusName
            createTime
            numberOfUpVote
            hasUpVote
          }
        }
      }
    `;
    const queryCancelResult = await queryClient({
      query: queryCancelStatusTag,
      variables: {
        id: response.tag.id,
      },
    });
    // console.log(queryCancelResult.data.tag);
    expect(queryCancelResult.data.tag.status).toMatchObject({
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
      // console.log(queryHasReadGuideResult);
      return (await queryClient({ query: queryHasReadGuideQL })).data
        .hasReadGuide;
    };

    expect(await queryHasReadGuide()).toBe(false);

    const mutateSetHasReadGuide = gql`
      mutation {
        setHasReadGuide
      }
    `;

    const mutateSetHasReadGuideResult = (
      await mutateClient({ mutation: mutateSetHasReadGuide })
    ).data.setHasReadGuide;
    // console.log(mutateSetHasReadGuideResult);

    // check if mutation successed
    expect(mutateSetHasReadGuideResult).toBe(true);

    // check if the setHasReadGuide success
    expect(await queryHasReadGuide()).toBe(true);
  });
});
