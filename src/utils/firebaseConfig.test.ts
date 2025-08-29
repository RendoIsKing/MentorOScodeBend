import admin from 'firebase-admin';

// Test-only initializer that reads credentials from env or uses ADC.
export function initFirebaseTest() {
  if (!admin.apps.length) {
    const json = process.env.FIREBASE_SERVICE_ACCOUNT_JSON
      ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON)
      : undefined;
    admin.initializeApp({
      credential: json ? admin.credential.cert(json) : admin.credential.applicationDefault(),
    });
  }
  return admin;
}

export default initFirebaseTest;


