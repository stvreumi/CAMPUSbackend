const path = require("path");
const os = require("os");
const fs = require("fs/promises");
const { DateTime } = require("luxon");

const { logger } = require("firebase-functions");
const { Storage } = require("@google-cloud/storage");

/**
 *
 * @param {import('firebase-admin').firestore.Firestore} firestore
 */
async function exportUserActivitiesToJson(firestore) {
  const exportData = [];
  const userActivityRef = firestore.collection("userActivity");
  const exportSanp = await userActivityRef.get();

  // * prepare data
  exportSanp.forEach((doc) => {
    const data = doc.data();
    const { createTime } = data;
    const createTimeTaipeiZoneISOString = DateTime.fromISO(
      createTime.toDate().toISOString()
    )
      .setZone("UTC+8")
      .toString();
    exportData.push({
      ...data,
      id: doc.id,
      createTime: createTimeTaipeiZoneISOString,
    });
  });

  // * store data locally

  // https://blog.techbridge.cc/2020/12/26/javascript-date-time-and-timezone/
  const timestamp = DateTime.now().setZone("Asia/Taipei").toISO();
  const filename = `userActivities-${timestamp}.json`;
  const localFilePath = path.join(os.tmpdir(), filename);

  await fs.writeFile(localFilePath, JSON.stringify(exportData));
  logger.log(`user activities export to ${filename}`);

  // * upload to gcp cloud storage bucket

  // ref: https://cloud.google.com/storage/docs/uploading-objects#storage-upload-object-code-sample
  const storage = new Storage();
  const bucketName = "smartcampus-1b31f-user-activities-exports";

  await storage
    .bucket(bucketName)
    .upload(localFilePath, { destination: filename });
  logger.log(`finish upload to bucket: ${bucketName}`);

  // delete all exported docs

  // ideas from: https://stackoverflow.com/questions/55067252/error-4-deadline-exceeded-deadline-exceeded-at-object-exports-createstatuserro
  // push all delete action promises into one array, and delete it all after
  // export data successfully.
  await Promise.all(
    exportData.map((data) => userActivityRef.doc(data.id).delete())
  );
}

module.exports = exportUserActivitiesToJson;
