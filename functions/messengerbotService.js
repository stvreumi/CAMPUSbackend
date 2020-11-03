const admin = require('firebase-admin');
const request = require('request');

const express = require('express');
const bodyParser = require('body-parser');
const requestPromise = require('request-promise');
const queryString = require('querystring');

const FirebaseAPI = require('./src/datasources/firebase');

// For LUIS configure
const {
  LUISappId,
  LUISPredictionKey,
  LUISPriditionEndpoint,
} = require('./src/luis_config');

// For Mesenger configure
const { verifyWebhook, PAGE_ACCESS_TOKEN } = require('./src/verify-webhook');

const app = express();
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.get('/messengerwebhook', verifyWebhook);

admin.initializeApp({
  credential: admin.credential.applicationDefault(),
  storageBucket: 'gs://smartcampus-1b31f.appspot.com',
});

// callSendAPI & handleMessage為用來回傳訊息給Messenger的function
// 因為fb messemger不像line有提供比較完善的API，所以有些東西要自己做
function callSendAPI(senderPsid, response) {
  // Construct the message body
  const requestBody = {
    recipient: {
      id: senderPsid,
    },
    message: response,
  };

  // Send the HTTP request to the Messenger Platform
  const endpoint = `https://graph.facebook.com/v8.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`;
  request(
    {
      uri: endpoint,
      method: 'POST',
      json: requestBody,
    },
    err => {
      if (!err) {
        console.log('message sent!');
      } else {
        console.error(`Unable to send message:${err}`);
      }
    }
  );
}

function handleMessage(senderPsid, answer) {
  const response = {
    text: answer,
  };

  // Send the response message
  callSendAPI(senderPsid, response);
}

// 當有人傳送訊息給Messenger Chatbot時，會執行的動作
// 也是因為不像line有提供比較完善的API，所以寫法比較沒那麼直覺
// 需要用到一些比較原始的Post之類的東西
app.post('/messengerwebhook', (req, res) => {
  const firebaseAPIinstance = new FirebaseAPI({ admin });

  // Parse the request body from the POST
  const { body } = req;

  // Check the webhook event is from a Page subscription
  if (body.object === 'page') {
    body.entry.forEach(async function (entry) {
      // Gets the body of the webhook event
      const webhookEvent = entry.messaging[0];

      const utterance = webhookEvent.message.text;
      console.log(`Recieved message '${utterance}'`);

      // Get the sender PSID
      const senderPsid = webhookEvent.sender.id;
      console.log(`Sender ID: ${senderPsid}`);

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

      const response = await requestPromise(pridictionUri);
      const intent = JSON.parse(response).prediction.topIntent;
      const answer = await firebaseAPIinstance.getAnswer(intent);

      // Display the response from the REST call.
      console.log(`top intent: ${intent}`);
      console.log(`answer: ${answer}`);

      // Check if the event is a message or postback and
      // pass the event to the appropriate handler function
      handleMessage(senderPsid, answer);
    });
    // Return a '200 OK' response to all events
    res.status(200).send('EVENT_RECEIVED');
  } else {
    // Return a '404 Not Found' if event is not from a page subscription
    res.sendStatus(404);
  }
});

app.listen(5000, () => console.log('[FACEBOOK MESSENGER CHATBOT已準備就緒]'));
