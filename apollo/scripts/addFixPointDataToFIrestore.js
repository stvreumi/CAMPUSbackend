const { readFileSync } = require('fs');

// https://github.com/brix/crypto-js#usage
/* eslint import/no-extraneous-dependencies: ["error", {"devDependencies": true}] */
const SHA256 = require('crypto-js/sha256');

const admin = require('firebase-admin');

// Please set google credential in the env when running
admin.initializeApp({
  credential: admin.credential.applicationDefault(),
});

const firestore = admin.firestore();

// read json file
const fixPoints = JSON.parse(
  readFileSync('../fixedPointData.json').toString('utf-8')
);

// convert geo related data to geo type, also have geo hash function and field
// give each information a unique uid, to reference status collection
const fixPointsWithGeoPointsAndId = fixPoints.map(point => {
  const { coordinates: originalCoordinates, information: originalInformation } =
    point;
  return {
    ...point,
    coordinates: new admin.firestore.GeoPoint(
      parseFloat(originalCoordinates.latitude),
      parseFloat(originalCoordinates.longitude)
    ),
    information: originalInformation.map(item => ({
      ...item,
      id: SHA256(JSON.stringify({ originalCoordinates, item }))
        .toString()
        .substring(0, 8),
    })),
  };
});

console.log('check data...');

console.dir(fixPointsWithGeoPointsAndId);
console.dir(fixPointsWithGeoPointsAndId.map(point => point.information));

// uploatd to collection `fixPoints`
Promise.all(
  fixPointsWithGeoPointsAndId.map(async point => {
    await firestore.collection('fixPoints').add(point);
  })
).catch(e => console.error(e));

console.log('finish upload!!');

// status collection name: `status-{uid}`
