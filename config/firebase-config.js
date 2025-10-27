// config/firebase-config.js
const admin = require('firebase-admin');

const projectId   = process.env.FB_PROJECT_ID;
const clientEmail = process.env.FB_CLIENT_EMAIL;
const privateKey  = (process.env.FB_PRIVATE_KEY || '').replace(/\\n/g, '\n');
const bucketName  = process.env.FB_STORAGE_BUCKET; // ej: "etnya-652be.appspot.com"

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId,
      clientEmail,
      privateKey,
    }),
    storageBucket: bucketName, // <-- clave: se define acá
  });
}

// Usamos SIEMPRE el bucket explícito por las dudas
const bucket = admin.storage().bucket(bucketName);

module.exports = { admin, bucket };
