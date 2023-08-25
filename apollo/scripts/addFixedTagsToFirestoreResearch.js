const { readFileSync } = require('fs');
const admin = require('firebase-admin');

// Initialize the Firebase Admin SDK
admin.initializeApp({
  credential: admin.credential.applicationDefault(),
});

const firestore = admin.firestore();

// Read the center_coordinates.json file
const centerCoordinates = JSON.parse(
  readFileSync('../fixedTagsResearch.json').toString('utf-8')
);

// Process the data and add to Firestore
Promise.all(
  centerCoordinates.map(async center => {
    const { groupId, mid, locationName, coordinates } = center;
    const taskData = {
      groupId,
      mid,
      locationName,
      coordinates: new admin.firestore.GeoPoint(
        coordinates.latitude,
        coordinates.longitude
      ),
    };
    await firestore.collection('fixedTag_research').add(taskData);
  })
)
  .then(() => console.log('finish upload center coordinates!'))
  .catch(e => console.error(e));
