import admin from "firebase-admin";
if (!admin.apps.length) {
  const json = process.env.FIREBASE_SERVICE_ACCOUNT_JSON
    ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON)
    : undefined;
  admin.initializeApp({
    credential: json ? admin.credential.cert(json) : admin.credential.applicationDefault(),
  });
}
export default admin;
