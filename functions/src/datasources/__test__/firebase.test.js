/**
 * @jest-environment node
 */
const firebase = require('@firebase/testing');
const FirebaseAPI = require('../firebase');
const {
  mockFirebaseAdmin,
  fakeTagData,
  fakeStatusData,
  fakeUserInfo,
  addFakeDataToFirestore,
  fakeIntent,
  clearFirestoreDatabase,
} = require('./testUtils');

// start the firestore emulator
// port 8080
const testProjectId = 'smartcampus-test';

describe('test data add operation', () => {
  let firebaseAPIinstance;
  beforeAll(() => {
    const admin = mockFirebaseAdmin(testProjectId);
    firebaseAPIinstance = new FirebaseAPI({ admin });
  });
  afterAll(async () => {
    await Promise.all(firebase.apps().map(app => app.delete()));
  });
  beforeEach(async () => {
    await clearFirestoreDatabase(testProjectId);
  });
  test('test `addTagDataToFirestore`', async () => {
    const data = { ...fakeTagData };
    const { uid } = fakeUserInfo;

    const docData = await firebaseAPIinstance.addTagDataToFirestore({
      data,
      uid,
    });

    // console.log(data);
    expect(docData).toMatchObject({
      id: expect.any(String),
      locationName: data.locationName,
      accessibility: data.accessibility,
      coordinates: data.coordinates,
      category: data.category,
      status: {
        statusName: fakeStatusData.statusName,
        createTime: expect.any(firebase.firestore.Timestamp),
      },
      createTime: expect.any(firebase.firestore.Timestamp),
      lastUpdateTime: expect.any(firebase.firestore.Timestamp),
      createUserID: uid,
      description: data.description,
      streetViewInfo: data.streetViewInfo,
    });
  });
  test('test `addNewIntent`', async () => {
    const data = { ...fakeIntent };

    const docData = await firebaseAPIinstance.addNewIntent({ data });
    expect(docData).toMatchObject({
      userintent: data.userintent,
      useranswer: data.useranswer,
    });
  });
  test('test `setTagDetailToFirestore` with some empty fields', async () => {
    const data = { ...fakeTagData };
    const uid = 'test-uid';

    // delete some fileds
    delete data.description;
    delete data.streetViewInfo;

    const docData = await firebaseAPIinstance.addTagDataToFirestore({
      data,
      uid,
    });

    // console.log(data);
    expect(docData).toMatchObject({
      description: '',
      streetViewInfo: null,
    });
  });
  test('test `addNewTagData`', async () => {
    const responseData = await addFakeDataToFirestore(firebaseAPIinstance);

    expect(responseData.tag).toMatchObject({
      id: expect.any(String),
      locationName: fakeTagData.locationName,
      accessibility: fakeTagData.accessibility,
      category: fakeTagData.category,
      coordinates: expect.any(firebase.firestore.GeoPoint),
      status: {
        statusName: fakeStatusData.statusName,
        createTime: expect.any(firebase.firestore.Timestamp),
      },
    });
    expect(responseData.imageNumber).toEqual(responseData.imageNumber);
    expect(responseData.imageUploadUrl.length).toEqual(
      responseData.imageNumber
    );
    expect(responseData.imageUploadUrl).toContain('http://signed.url');
  });
}); // end describe

describe('test data read operation', () => {
  let firebaseAPIinstance;
  beforeAll(async () => {
    const admin = mockFirebaseAdmin(testProjectId);
    firebaseAPIinstance = new FirebaseAPI({ admin });
  });
  afterAll(async () => {
    await Promise.all(firebase.apps().map(app => app.delete()));
  });
  beforeEach(async () => {
    await clearFirestoreDatabase(testProjectId);

    // add data
    await addFakeDataToFirestore(firebaseAPIinstance);
  });

  test('test `getTagList`', async () => {
    const tagDataList = await firebaseAPIinstance.getTagList();
    // console.log(tagDataList);
    expect(tagDataList).toEqual(expect.any(Array));

    // if use `toEqual`, the f field must included in the test object
    expect(tagDataList[0]).toMatchObject({
      id: expect.any(String),
      locationName: fakeTagData.locationName,
      accessibility: fakeTagData.accessibility,
      category: {
        missionName: expect.any(String),
        subTypeName: expect.any(String),
        targetName: expect.any(String),
      },
      coordinates: expect.any(firebase.firestore.GeoPoint),
      status: {
        statusName: fakeStatusData.statusName,
        createTime: expect.any(firebase.firestore.Timestamp),
      },
    });
  });
  test('test `getUserAddTagHistory`', async () => {
    const { uid } = fakeUserInfo;
    const tagDataList = await firebaseAPIinstance.getUserAddTagHistory({ uid });
    // console.log(tagDataList);
    expect(tagDataList).toEqual(expect.any(Array));

    // if use `toEqual`, the f field must included in the test object
    expect(tagDataList[0]).toMatchObject({
      id: expect.any(String),
      locationName: fakeTagData.locationName,
      accessibility: fakeTagData.accessibility,
      category: {
        missionName: expect.any(String),
        subTypeName: expect.any(String),
        targetName: expect.any(String),
      },
      coordinates: expect.any(firebase.firestore.GeoPoint),
      status: {
        statusName: fakeStatusData.statusName,
        createTime: expect.any(firebase.firestore.Timestamp),
      },
    });
  });
});
