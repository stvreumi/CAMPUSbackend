const { readFileSync } = require('fs');
const admin = require('firebase-admin');
// eslint-disable-next-line import/no-unresolved
const { geohashForLocation } = require('geofire-common');

// Initialize the Firebase Admin SDK if not already done
admin.initializeApp({
  credential: admin.credential.applicationDefault(),
});

const firestore = admin.firestore();

// Read the task_list2.json file
const taskList = JSON.parse(
  readFileSync('../fixedTagDataResearch.json').toString('utf-8')
);

// Generate a random 28-character string
const createUserId = () => {
  let result = '';
  const characters =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  // eslint-disable-next-line no-plusplus
  for (let i = 0; i < 28; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return result;
};

const now = Date.now();
const oneWeek = 1000 * 60 * 60 * 24 * 7;

const createUserIdAndTimestamps = () => {
  const userId = createUserId();

  const createTime = admin.firestore.Timestamp.fromMillis(
    now - Math.random() * oneWeek
  );

  const lastUpdateTime = admin.firestore.Timestamp.fromMillis(
    createTime.toMillis() + Math.random() * oneWeek
  );

  return { userId, createTime, lastUpdateTime };
};

const addSubTasksToTagDataResearch = async () => {
  const fixedTagResearchSnapshot = await firestore
    .collection('fixedTag_research')
    .get();
  // const { userId, createTime, lastUpdateTime } = createUserIdAndTimestamps();
  // Create a promise for each task in fixedTag_research
  const promises = fixedTagResearchSnapshot.docs.map(async taskDoc => {
    const taskData = taskDoc.data();
    const fixedTagId = taskDoc.id; // Get the document name as fixedTagId
    const subTasks = taskList.filter(
      task => task.fixedTagId === `m${taskData.mid}`
    );

    return Promise.all(
      subTasks.map(async subTask => {
        const { userId, createTime, lastUpdateTime } =
          createUserIdAndTimestamps();
        const geohash = geohashForLocation([
          subTask.coordinates.latitude,
          subTask.coordinates.longitude,
        ]);
        const subTaskData = {
          createUserId: userId,
          createTime,
          lastUpdateTime,
          archived: false,
          fixedTagId, // Use the document name
          locationName: subTask.locationName,
          coordinates: new admin.firestore.GeoPoint(
            subTask.coordinates.latitude,
            subTask.coordinates.longitude
          ),
          floor: subTask.floor,
          category: subTask.category,
          geohash,
        };

        // Add sub-task data to the "tagData_research" collection
        const subTaskRef = await firestore
          .collection('tagData_research')
          .add(subTaskData);

        // Add status data to the new sub-collection "statusCollection" with createTime and createUserId
        const statusData = {
          statusName: subTask.status.statusName,
          statusDescName: subTask.status.statusDescName,
          createUserId: userId,
          createTime,
        };
        return subTaskRef.collection('status').add(statusData);
      })
    );
  });

  return Promise.all(promises);
};

addSubTasksToTagDataResearch()
  .then(() =>
    console.log(
      'finish adding eight sub-tasks for each task in fixedTag_research!'
    )
  )
  .catch(e => console.error(e));
