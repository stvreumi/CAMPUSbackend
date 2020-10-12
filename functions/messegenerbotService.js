// YOUR-APP-ID: The App ID GUID found on the www.luis.ai Application Settings page.
const LUISappId = '211d2292-7bc4-49bd-b4fc-06a5c96445d1';

// YOUR-PREDICTION-KEY: Your LUIS authoring key, 32 character value. for test: '9c5c12b84a98428294d6d4c0ee01b73a'
const LUISPredictionKey = '';

// YOUR-AUTHORING-KEY: Starter_Key, for testing '9c5c12b84a98428294d6d4c0ee01b73a'
// const LUISAuthoringKey = '';

// YOUR-PREDICTION-ENDPOINT: Replace this with your authoring key endpoint
const LUISPriditionEndpoint = 'https://westus.api.cognitive.microsoft.com/';

// YOUR-API-ENDPOINT: Starter_Key
// const LUISEndpoint = 'https://westus.api.cognitive.microsoft.com/';

// const LUISversionId = '0.1';

const admin = require('firebase-admin');
const request = require('request');

// if you dont know what it is, check 'https://wcc723.github.io/javascript/2017/12/15/javascript-use-strict/'
// ('use strict');
// PAGE_ACCESS_TOKEN = EAAFN87dRCNgBAATZALMk4B8Pw7ZCrdyXsPY3AjPMGcVVFPmGrUjJF8WoIXdhRRRelZBLT51UTHrLzxLPvoMdex5CpvrOVAduquIZCngXzEfMtzDgjUDIFZA0hZBFyAG73pQr8rqwV9WjhiqbtiwfdvBQ4byon1sInBADulnegcZBwZDZD
const PAGE_ACCESS_TOKEN = '';
const express = require('express');
const bodyParser = require('body-parser');
// const axios = require('axios');
const requestPromise = require('request-promise');
const queryString = require('querystring');
const verifyWebhook = require('./src/verify-webhook');
const FirebaseAPI = require('./src/datasources/firebase');

/* add utterances parameters */
/* const configAddUtterances = {
  LUISSubscriptionKey: LUISAuthoringKey,
  LUISappId,
  LUISversionId,
  question: '',
  intent: '',
  uri: `${LUISEndpoint}luis/authoring/v3.0-preview/apps/${LUISappId}/versions/${LUISversionId}/examples`,
}; */

const app = express();

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.get('/messengerwebhook', verifyWebhook);

admin.initializeApp({
  credential: admin.credential.applicationDefault(),
  storageBucket: 'gs://smartcampus-1b31f.appspot.com',
});

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

function handleMessage(senderPsid, receivedMessage, answer) {
  let response;

  // Checks if the message contains text
  if (receivedMessage.text) {
    // Create the payload for a basic text message, which
    // will be added to the body of our request to the Send API
    response = {
      text: answer,
    };
  } else if (receivedMessage.attachments) {
    // Get the URL of the message attachment
    /* let attachment_url = receivedMessage.attachments[0].payload.url;
    response = {
      "attachment": {
        "type": "template",
        "payload": {
          "template_type": "generic",
          "elements": [{
            "title": "Is this the right picture?",
            "subtitle": "Tap a button to answer.",
            "image_url": attachment_url,
            "buttons": [
              {
                "type": "postback",
                "title": "Yes!",
                "payload": "yes",
              },
              {
                "type": "postback",
                "title": "No!",
                "payload": "no",
              }
            ],
          }]
        }
      }
    } */
  }

  // Send the response message
  callSendAPI(senderPsid, response);
}

function handlePostback(senderPsid, receivedPostback) {
  console.log('ok');
  let response;
  // Get the payload for the postback
  const { payload } = receivedPostback;

  // Set the response based on the postback payload
  if (payload === 'yes') {
    response = { text: 'Thanks!' };
  } else if (payload === 'no') {
    response = { text: 'Oops, try sending another image.' };
  }
  // Send the message to acknowledge the postback
  callSendAPI(senderPsid, response);
}

// Accepts POST requests at /messengerwebhook endpoint
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

      // Analyze a string utterance.
      // const getPrediction = async () => {
      // console.log(`get prediction`);
      // Send the REST call.
      const response = await requestPromise(pridictionUri);
      // console.log(`got prediction`);
      // Get the topIntent
      const intent = JSON.parse(response).prediction.topIntent;
      const answer = await firebaseAPIinstance.getAnswer(intent);

      // Display the response from the REST call.
      console.log(`top intent: ${intent}`);
      console.log(`answer: ${answer}`);
      // };

      // Check if the event is a message or postback and
      // pass the event to the appropriate handler function
      if (webhookEvent.message) {
        handleMessage(senderPsid, webhookEvent.message, answer);
      } else if (webhookEvent.postback) {
        handlePostback(senderPsid, webhookEvent.postback, answer);
      }
    });
    // Return a '200 OK' response to all events
    res.status(200).send('EVENT_RECEIVED');
  } else {
    // Return a '404 Not Found' if event is not from a page subscription
    res.sendStatus(404);
  }
});

app.listen(5000, () => console.log('Express server is listening on port 5000'));
