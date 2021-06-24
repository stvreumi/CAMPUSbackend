const admin = require('firebase-admin');

// geofirestore
const { GeoFirestore } = require('geofirestore');

/**
 * firebase initialization
 */

const firestoreURL = 'https://smartcampus-1b31f.firebaseio.com';

admin.initializeApp({
  credential: admin.credential.applicationDefault(),
  databaseURL: firestoreURL,
});

// Create a GeoFirestore reference
const firestore = admin.firestore();
const geofirestore = new GeoFirestore(firestore);

/**
 * category initialization
 */
async function missionInit() {
  // add mission list
  const toyMissionList = [
    {
      name: '無障礙設施',
    },
    {
      name: '道路障礙',
    },
  ];
  const missionListRef = firestore.collection('missionList');

  // add mission list to firestore mission_list collection
  await Promise.all(
    toyMissionList.map(async (element) => {
      const ref = await missionListRef.add(element);
      console.log('update: ', element);
      //console.log(ref.id);
      if (element.name === '道路障礙') {
        console.log(ref.id);
        await discoveryInit(ref.id);
      }
    })
  );
}

async function discoveryInit(ObstacleMissionID) {
  // add discovery list
  const toyDiscoveryList = [
    {
      missionID: ObstacleMissionID,
      name: '障礙物',
    },
    {
      missionID: ObstacleMissionID,
      name: '下雨濕滑',
    },
  ];

  const discoveryListRef = firestore.collection('discoveryList');

  // add mission list to firestore mission_list collection
  await Promise.all(
    toyDiscoveryList.map(async (element) => {
      await discoveryListRef.add(element);
      console.log('update: ', element);
    })
  );
}

async function getList(collectionName) {
  const list = {};
  try {
    const querySnapshot = await firestore.collection(collectionName).get();
    querySnapshot.forEach((doc) => {
      const data = doc.data();
      list[data.name] = {
        id: doc.id,
        ...data,
      };
    });
  } catch (err) {
    console.log(collectionName, ' error: ', err);
  }
  return list;
}

async function updateToyExample() {
  // init category
  await missionInit();
  // tag collection reference
  const tagRef = geofirestore.collection('tagData');
  const tagDetailRef = firestore.collection('tagDetail');

  try {
    const missionList = await getList('missionList');
    const discoveryList = await getList('discoveryList');

    console.log(missionList);
    console.log(discoveryList);
    const toyExample = {
      title: '工程三館',
      accessibility: 3.0, // from 1.0 to 5.0 rating
      missionID: missionList['無障礙設施'].id,
      discoveryIDs: [discoveryList['下雨濕滑'].id],
      coordinates: new admin.firestore.GeoPoint(
        24.786671229129603,
        120.99745541810988
      ),
      // (latitude, longitude)
    };

    // get id after add to firestore
    const refAfterAdd = await tagRef.add(toyExample);

    const toyDetail = {
      createTime: admin.firestore.FieldValue.serverTimestamp(),
      lastUpdateTime: admin.firestore.FieldValue.serverTimestamp(),
      createUserID: 'TOY',
      location: {
        geoInfo: {
          // specific format of geojson
          type: 'Point',
          coordinates: ['120.99745541810988', '24.786671229129603'],
          // (longitude, latitude)
        },
      },
      description: '嚴重到無法通過',
      imageUrl: ['https://image-url/123123123'],
    };

    // add detail data with same id
    tagDetailRef.doc(refAfterAdd.id).set(toyDetail);
    console.log('finish update');
  } catch (err) {
    console.log('update fail:', err);
  }
}

updateToyExample();
