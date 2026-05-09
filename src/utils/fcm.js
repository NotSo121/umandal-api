const admin = require('firebase-admin');

let initialized = false;

const initFcm = () => {
  if (initialized) return;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) {
    console.warn('[fcm] FIREBASE_SERVICE_ACCOUNT not set — push disabled');
    return;
  }
  try {
    admin.initializeApp({ credential: admin.credential.cert(JSON.parse(raw)) });
    initialized = true;
    console.log('[fcm] Firebase Admin initialized');
  } catch (err) {
    console.error('[fcm] Failed to initialize Firebase Admin:', err.message);
  }
};

const sendPush = async (token, title, body) => {
  if (!initialized) return;
  try {
    await admin.messaging().send({
      token,
      notification: { title, body },
      webpush: {
        notification: { icon: '/icons/Icon-192.png' },
      },
    });
  } catch (err) {
    console.error('[fcm] sendPush error:', err.code ?? err.message);
  }
};

module.exports = { initFcm, sendPush };
