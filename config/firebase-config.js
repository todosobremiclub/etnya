const admin = require('firebase-admin');
const path = require('path');

const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  storageBucket: 'etnya-652be.firebasestorage.app' // cambiá esto si tu bucket es distinto
});

const bucket = admin.storage().bucket();

module.exports = bucket;
