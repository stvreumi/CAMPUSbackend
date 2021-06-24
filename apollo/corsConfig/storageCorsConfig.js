const { Storage } = require('@google-cloud/storage');

const storage = new Storage();
const bucket = storage.bucket('gs://smartcampus-1b31f.appspot.com');

const corsConfig = [
  {
    origin: ['http://localhost'],
    method: ['PUT'],
    maxAgeSeconds: 300,
    responseHeader: ['Content-Type'],
  },
];

bucket.setCorsConfiguration(corsConfig).then(data => console.log(data[0].cors));
