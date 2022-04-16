const { readFileSync } = require('fs');

const admin = require('firebase-admin');

// Please set google credential in the env when running
admin.initializeApp({
  credential: admin.credential.applicationDefault(),
});

const firestore = admin.firestore();

// read json file
const fixPoints = JSON.parse(
  readFileSync('../fixedTagsData.json').toString('utf-8')
);

// convert geo related data to geo type, also have geo hash function and field
// give each information a unique uid, to reference status collection
const fixPointsWithGeoPointsAndId = fixPoints.map(point => {
  const { coordinates: originalCoordinates } = point;
  return {
    ...point,
    coordinates: new admin.firestore.GeoPoint(
      parseFloat(originalCoordinates.latitude),
      parseFloat(originalCoordinates.longitude)
    ),
  };
});

console.log('check data...');

console.dir(fixPointsWithGeoPointsAndId);
console.dir(fixPointsWithGeoPointsAndId.map(point => point.information));

// uploatd to collection `fixPoints`
Promise.all(
  fixPointsWithGeoPointsAndId.map(async point => {
    const { locationName, coordinates, viewCount, information } = point;
    const tagData = { locationName, coordinates, viewCount };
    const tagRef = await firestore.collection('fixedTags').add(tagData);
    return Promise.all(
      information.map(async info => {
        const subLocationData = { ...info, fixedTagId: tagRef.id };
        await firestore.collection('fixedTagSubLocation').add(subLocationData);
      })
    );
  })
).catch(e => console.error(e));

console.log('finish upload!!');

// status collection name: `status-{uid}`
