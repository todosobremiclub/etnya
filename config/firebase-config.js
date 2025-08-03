const admin = require('firebase-admin');
const serviceAccount = JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON);

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  storageBucket: 'etnya-652be.firebasestorage.app'
});

}

const bucket = admin.storage().bucket(); // ✅ Esto es lo que tenés que exportar

module.exports = bucket;