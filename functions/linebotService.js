// 引用linebot SDK
const linebot = require('linebot');

const admin = require('firebase-admin');
const requestPromise = require('request-promise');
const queryString = require('querystring');
const FirebaseAPI = require('./src/datasources/firebase');

// For LUIS configure
const {
  LUISappId,
  LUISPredictionKey,
  LUISPriditionEndpoint,
} = require('./src/luis_config');

// 用於辨識Line Channel的資訊
const bot = linebot({
  channelId: '1654797428',
  channelSecret: '59fadb2dcb6c66e338ad7273806d5a10', // for test: '59fadb2dcb6c66e338ad7273806d5a10'
  // for test: 'dIiLIe5t6UO+BZo5VzGX951whXwdEMtXASzl6x8dP0spZG4Q8M1mbPMq/jqfdGz13X7p3bVzYbWBnTYhJenl8gSAC63W3QB9H0YdnGmb6aqZkgn5G5F34BTZHsixn6bWi5YXG1S52oQ4x1raGU2XrAdB04t89/1O/w1cDnyilFU='
  channelAccessToken: '',
});

// 當有人傳送訊息給Bot時
bot.on('message', async event => {
  const firebaseAPIinstance = new FirebaseAPI({ admin });

  // 取得使用者所傳的文字訊息
  const utterance = event.message.text;
  console.log(`Recieved message ${utterance} from Linebot`);

  // 要傳給LUIS去判斷Intent的格式
  const queryParams = {
    'show-all-intents': true,
    verbose: true,
    query: utterance,
    'subscription-key': LUISPredictionKey,
  };

  // 將上面的格式包在這個API裡頭（讓我們的程式知道LUIS在哪裡）
  const pridictionUri = `${LUISPriditionEndpoint}luis/prediction/v3.0/apps/${LUISappId}/slots/production/predict?${queryString.stringify(
    queryParams
  )}`;

  // 傳送一個Post過去上述API，response就是LUIS回傳給我們的資訊
  const response = await requestPromise(pridictionUri);
  // 會是LUIS判斷該使用者傳的文字的Intent的機率，你可以把註解解開來看看是什麼
  // console.log(`Response from LUIS: ${respunse}`);

  // 直接取得機率最高的Intent
  const intent = JSON.parse(response).prediction.topIntent;
  // Display the response from the REST call.
  console.log(`top intent: ${intent}`);

  const answer = await firebaseAPIinstance.getAnswer(intent);

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
});

admin.initializeApp({
  credential: admin.credential.applicationDefault(),
  storageBucket: 'gs://smartcampus-1b31f.appspot.com',
});

// Bot所監聽的webhook路徑與port
bot.listen('/linewebhook', 3000, () => {
  console.log('[LINEBOT已準備就緒]');
});
