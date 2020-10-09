// 引用LUIS SDK
// const msRest = require("@azure/ms-rest-js");
// const LUISAuthoring = require("@azure/cognitiveservices-luis-authoring");
// const LUISPrediction = require("@azure/cognitiveservices-luis-runtime");

// 引用linebot SDK
const linebot = require('linebot');

// YOUR-APP-ID: The App ID GUID found on the www.luis.ai Application Settings page.
const LUISappId = '8da0cc8e-6ca6-422b-957e-45d6184bcf1a';

// YOUR-PREDICTION-KEY: Your LUIS authoring key, 32 character value. for test: 'e1a4a2cc5f1b40fbbb86eccedcca1c6f'
const LUISPredictionKey = '';

// YOUR-AUTHORING-KEY: Starter_Key, for testing '6da613deaa9042beae670f765936fda3'
const LUISAuthoringKey = '';

// YOUR-PREDICTION-ENDPOINT: Replace this with your authoring key endpoint
const LUISPriditionEndpoint = 'https://japaneast.api.cognitive.microsoft.com/';

// YOUR-API-ENDPOINT: Starter_Key
const LUISEndpoint = 'https://westus.api.cognitive.microsoft.com/';

const LUISversionId = '0.1';

const admin = require('firebase-admin');
const requestPromise = require('request-promise');
const queryString = require('querystring');
const FirebaseAPI = require('./src/datasources/firebase');

// upload the question to LUIS
const upload = require('./src/azuretools/_upload');

/* add utterances parameters */
const configAddUtterances = {
  LUISSubscriptionKey: LUISAuthoringKey,
  LUISappId,
  LUISversionId,
  question: '',
  intent: '',
  uri: `${LUISEndpoint}luis/authoring/v3.0-preview/apps/${LUISappId}/versions/${LUISversionId}/examples`,
};

// 用於辨識Line Channel的資訊
const bot = linebot({
  channelId: '1654797428',
  channelSecret: '59fadb2dcb6c66e338ad7273806d5a10', // for test: '59fadb2dcb6c66e338ad7273806d5a10'
  // for test: 'dIiLIe5t6UO+BZo5VzGX951whXwdEMtXASzl6x8dP0spZG4Q8M1mbPMq/jqfdGz13X7p3bVzYbWBnTYhJenl8gSAC63W3QB9H0YdnGmb6aqZkgn5G5F34BTZHsixn6bWi5YXG1S52oQ4x1raGU2XrAdB04t89/1O/w1cDnyilFU='
  channelAccessToken: '',
});

// 當有人傳送訊息給Bot時
bot.on('message', event => {
  const firebaseAPIinstance = new FirebaseAPI({ admin });

  // The utterance you want to use.
  const utterance = event.message.text;

  // Create query string
  const queryParams = {
    'show-all-intents': true,
    verbose: true,
    query: utterance,
    'subscription-key': LUISPredictionKey,
  };

  // Create the URI for the REST call.
  const pridictionUri = `${LUISPriditionEndpoint}luis/prediction/v3.0/apps/${LUISappId}/slots/production/predict?${queryString.stringify(
    queryParams
  )}`;

  // Analyze a string utterance.
  const getPrediction = async () => {
    // Send the REST call.
    const response = await requestPromise(pridictionUri);

    // Get the topIntent
    const intent = JSON.parse(response).prediction.topIntent;
    const answer = await firebaseAPIinstance.getAnswer(intent);

    // Display the response from the REST call.
    console.log(`top intent: ${intent}`);

    // 使用event.reply(要回傳的訊息)方法可將訊息回傳給使用者
    event
      .reply(answer)
      .then(() => {
        // 當訊息成功回傳後的處理
        console.log(`Success reply the answer: ${answer}`);
      })
      .catch(error => {
        // 當訊息回傳失敗後的處理
        console.log(`error at reply message: ${error}`);
      });

    // Add the user_question to LUIS to train
    console.log(`start add question to LUIS...`);
    const questions = {};
    questions[intent] = [utterance];
    try {
      configAddUtterances.intents = [intent];
      configAddUtterances.questions = questions;
      upload(configAddUtterances);
      console.log(`succeed to add question to LUIS`);
    } catch (err) {
      console.log(`Add the user_question to LUIS error: ${err}`);
    }

    // Add the User_question to Firestore to analyze
    await firebaseAPIinstance
      .addNewQuestion({
        userintent: intent,
        userquestion: utterance,
      })
      .then(() => {
        console.log(`add question succeed`);
      })
      .catch(error => {
        console.error(error);
      });
  };

  console.log(`user's question: ${utterance}`);

  // Pass an utterance to the sample LUIS app
  getPrediction()
    .then(() => console.log('done'))
    .catch(err => console.log(err));
});

admin.initializeApp({
  credential: admin.credential.applicationDefault(),
  storageBucket: 'gs://smartcampus-1b31f.appspot.com',
});

// Bot所監聽的webhook路徑與port
bot.listen('/linewebhook', 3000, () => {
  console.log('[BOT已準備就緒]');
});
