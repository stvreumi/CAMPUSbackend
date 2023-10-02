const { readFileSync } = require('fs');

const admin = require('firebase-admin');
const { FieldValue, GeoPoint } = require('firebase-admin').firestore;
const { geohashForLocation } = require('geofire-common');

// Please set google credential in the env when running
admin.initializeApp({
  credential: admin.credential.applicationDefault(),
});

const firestore = admin.firestore();

// read json file
const fixPoints = JSON.parse(
  readFileSync('../fixedTagResearchesData.json').toString('utf-8')
  //   readFileSync('../fixedTagsData.json').toString('utf-8')
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
// console.dir(fixPointsWithGeoPointsAndId.map(point => point.information));

// upload to `fixedTagResearches` collection
Promise.all(
  fixPointsWithGeoPointsAndId.map(async point => {
    const { locationName, coordinates, information } = point;
    const tagResearchData = { locationName, coordinates };
    const tagRef = await firestore
      .collection('fixedTag_research')
      .add(tagResearchData);
    console.log('uploading to...', tagRef.id);
    Promise.all(
      information.map(async info => {
        const geohashTmp = geohashForLocation([
          parseFloat(info.tagCoordinates.latitude),
          parseFloat(info.tagCoordinates.longitude),
        ]);
        const coordinatesTmp = new GeoPoint(
          parseFloat(info.tagCoordinates.latitude),
          parseFloat(info.tagCoordinates.longitude)
        );
        const { tagLocationName, floor, status, category, createUserId } = info;
        const tagsData = {
          locationName: tagLocationName,
          coordinates: coordinatesTmp,
          floor,
          category,
          createUserId,
          fixedTagId: tagRef.id,
          createTime: FieldValue.serverTimestamp(),
          lastUpdateTime: FieldValue.serverTimestamp(),
          geohash: geohashTmp,
          archived: false,
        };
        const promises = [];
        const fixedTagsSnapshot = await firestore
          .collection('tagData_research')
          .add(tagsData);
        console.log(fixedTagsSnapshot.id);
        const statusData = {
          ...status,
          createTime: FieldValue.serverTimestamp(),
        };
        promises.push(fixedTagsSnapshot.collection('status').add(statusData));
        await Promise.all(promises);
      })
    ).catch(err => console.log('Information Upload', err.message));
  })
).catch(err => console.log(err.message));
