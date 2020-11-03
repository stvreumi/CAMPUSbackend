// eslint-disable-line global-require
const GoogleSpreadsheet = require('google-spreadsheet');
const { promisify } = require('util');
const admin = require('firebase-admin');
const FirebaseAPI = require('../src/datasources/firebase');

const creds = require('../../../../key_rootdir/smartcampus-1b31f-firebase-adminsdk-qamsd-a188096453.json');

async function accessSpreadsheet() {
  const doc = new GoogleSpreadsheet(
    '1CNvGbW8GNO52t6pMSI4pBTaGfeA8HAkrWdgc2dhWRg4'
  );
  await promisify(doc.useServiceAccountAuth)(creds);
  const info = await promisify(doc.getInfo)();
  const sheet = info.worksheets[0];
  const firebaseAPIinstance = new FirebaseAPI({ admin });
  const rows = await promisify(sheet.getRows)({
    offset: 1,
  });

  rows.forEach(async faq => {
    const data = { ...faq };
    // add intent and all the answer to firestore
    // await firebaseAPIinstance.addNewIntent({data});

    // send intent to firestore and get answer from there
    const intent = data.userintent;
    const answer = await firebaseAPIinstance.getAnswer(intent);
    console.log(`Intent : ${intent}\nAnswer : ${answer}\n`);
  });
}

admin.initializeApp({
  credential: admin.credential.applicationDefault(),
  storageBucket: 'gs://smartcampus-1b31f.appspot.com',
});

accessSpreadsheet();
