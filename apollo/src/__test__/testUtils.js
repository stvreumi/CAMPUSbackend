import axios from 'axios';
import { nanoid } from 'nanoid';
import gql from 'graphql-tag';

import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import 'firebase-admin/storage';

import { jest } from '@jest/globals';

/**
 * @typedef {import('../types').DataSources} DataSources
 * @typedef {import('firebase-admin').app.App} firebaseAdminApp
 * @typedef {import('firebase-admin').auth.Auth} firebaseAdminAppAuth
 */

const fakeDataId = 'test-fakedata-id';

const fakeCategory = {
  missionName: '設施回報',
  subTypeName: '無障礙設施',
  targetName: '無障礙坡道',
};

const fakeStreetViewData = {
  povHeading: 52.16330308370064,
  povPitch: -14.148336578552815,
  panoID: '0pq7qRZQvlQ8rzUrnZLk2g',
  cameraLatitude: 24.7872616,
  cameraLongitude: 120.9969249,
};

// the fake data will input from front end
const fakeTagData = {
  locationName: 'test',
  category: { ...fakeCategory },
  coordinates: {
    longitude: '120.99745541810988',
    latitude: '24.786671229129603',
  },
  description: 'test-description',
  // [longitude, latitude]
  streetViewInfo: { ...fakeStreetViewData },
  floor: 3,
  imageUploadNumber: 2,
  statusName: '存在',
};

const fakeStatusData = {
  statusName: '存在',
};

// ref: https://github.com/firebase/firebase-js-sdk/blob/master/packages/rules-unit-testing/src/public_types/index.ts#L32
const fakeUserRecord = {
  email: 'test-uid@test.com',
  displayName: 'test-display-name',
  photoURL: 'http://photo.url',
};

/**
 * Mock firebase admin instance
 * @param {string} projectId The projectId to initiate firebase admin
 * @returns {object} the mock and initiate firebase app instance
 * https://firebase.google.com/docs/rules/unit-tests#rut-v1-testing
 * Create a `RulesTestContext` object for interact with emulator
 */
async function mockFirebaseAdmin(projectId) {
  // attach firestore to admin
  const admin = initializeApp({ projectId });

  const testAdmin = Object();

  testAdmin.auth = jest.fn(() => getAuth(admin));
  testAdmin.firestore = jest.fn(() => getFirestore(admin));
  // mock storage
  const mockBuckeFile = jest.fn(_ => ({
    getSignedUrl: jest.fn(__ => ['http://signed.url']),
    delete: jest.fn(),
  }));
  const mockBucketGetFiles = jest.fn(options => {
    const { directory } = options;
    return [
      [
        {
          metadata: {
            // The tmp file name format is determined by the id genereator.
            // Currently we use [nanoid](https://github.com/ai/nanoid)
            mediaLink: `https://storage.googleapis.com/download/storage/v1/b/smartcampus-1b31f.appspot.com/o/${
              directory / nanoid()
            }/?generation=1607929899797089&alt=media"`,
          },
        },
      ],
    ];
  });
  const mockBucket = jest.fn(() => ({
    file: mockBuckeFile,
    getFiles: mockBucketGetFiles,
  }));

  testAdmin.storage = jest.fn(() => ({
    bucket: mockBucket,
  }));

  return testAdmin;
}

/**
 * Add fakeData to firestore
 * @param {Function} mutateClient
 * @param {Boolean} testNumberOfUpVote true if we want to add fake data to test
 *   numberOfUpVote, which is 問題回報
 * @return {AddNewTagResponse} Contain the upload tag information, and image
 */
async function addFakeDataToFirestore(
  mutateClient,
  testNumberOfUpVote = false
) {
  const addNewTag = gql`
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
          }
        }
        imageUploadNumber
        imageUploadUrls
      }
    }
  `;
  const data = {
    ...fakeTagData,
  };
  const hasNumberOfUpVoteCategory = {
    missionName: '問題回報',
    subTypeName: '',
    targetName: '',
  };
  if (testNumberOfUpVote) {
    data.category = { ...hasNumberOfUpVoteCategory };
    data.statusName = '已解決';
  }

  const result = await mutateClient({
    mutation: addNewTag,
    variables: { data },
  });
  return result.data.addNewTagData;
}

/**
 * Using emulator specific API to clear database
 * ref: https://firebase.google.com/docs/emulator-suite/connect_firestore#clear_your_database_between_tests
 * or use `clearFirestoreData({ projectId: string }) => Promise`
 * ref: https://firebase.google.com/docs/rules/unit-tests#test_sdk_methods
 * @param {String} projectID the id of the firestore emulator
 */
async function clearFirestoreDatabase(projectID) {
  const clearURL = `http://localhost:8080/emulator/v1/projects/${projectID}/databases/(default)/documents`;
  await axios.delete(clearURL);
  // console.log('clear response:', res.status);
}

/**
 * https://stackoverflow.com/questions/65464512/create-a-user-programatically-using-firebase-auth-emulator
 * https://firebase.google.com/docs/auth/admin/manage-users#create_a_user
 * @param {firebaseAdminAppAuth} auth
 * @returns {string}
 */
export async function addTestAccountToAuthEmulator(auth) {
  const { email, displayName, photoURL } = fakeUserRecord;
  const { uid } = await auth.createUser({ email, displayName, photoURL });
  return uid;
}

/**
 * Using emulator specific API to clear auth accounts
 * https://firebase.google.com/docs/reference/rest/auth#section-auth-emulator-clearaccounts
 * @param {string} projectID
 */
export async function clearAllAuthAccounts(projectID) {
  const clearURL = `http://localhost:9099/emulator/v1/projects/${projectID}/accounts`;
  await axios.delete(clearURL);
}

// TODO: export it when defining the function,
// we don't need to export it in the last line of the files
export {
  mockFirebaseAdmin,
  addFakeDataToFirestore,
  fakeTagData,
  fakeDataId,
  fakeCategory,
  fakeStatusData,
  fakeUserRecord,
  clearFirestoreDatabase,
};
