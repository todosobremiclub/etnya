// firebase.js
const admin = require('firebase-admin');

// Inicializa firebase-admin usando variables de entorno
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FB_PROJECT_ID,
      clientEmail: process.env.FB_CLIENT_EMAIL,
      privateKey: (process.env.FB_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
    }),
    storageBucket: process.env.FB_STORAGE_BUCKET,
  });
}

module.exports = admin;


