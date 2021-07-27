// Imports the Google Cloud client library
const { Storage } = require('@google-cloud/storage');

// Creates a client
const storage = new Storage();

async function getBucketMetadata(bucketName) {
  // Get bucket metadata.
  /**
   * TODO(developer): Uncomment the following line before running the sample.
   */
  // const bucketName = 'Name of a bucket, e.g. my-bucket';

  // Get Bucket Metadata
  const [metadata] = await storage.bucket(bucketName).getMetadata();
  console.log(metadata.cors);
}
getBucketMetadata('gs://smartcampus-1b31f.appspot.com').then(
  console.log('success')
);
