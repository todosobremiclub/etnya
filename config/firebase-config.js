const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  storageBucket: 'etnya-652be.firebasestorage.app' // ⚠️ tu bucket real
});

const bucket = admin.storage().bucket();
module.exports = bucket;


