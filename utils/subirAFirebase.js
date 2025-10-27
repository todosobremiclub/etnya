// utils/subirAFirebase.js
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const admin = require('../firebase'); // usa el init de arriba

// Dado un buffer y el nombre original, sube a Firebase Storage y devuelve URL pública firmada
module.exports = async function subirAFirebase(buffer, originalName = 'archivo') {
  const bucket = admin.storage().bucket();
  const ext = path.extname(originalName || '').replace('.', '').toLowerCase() || 'bin';

  const filename = `noticias/${Date.now()}_${uuidv4()}.${ext}`;
  const file = bucket.file(filename);

  await file.save(buffer, {
    resumable: false,
    contentType: `image/${ext}`,
    metadata: { cacheControl: 'public, max-age=31536000' }
  });

  // Si tu bucket es público, podrías usar:
  // await file.makePublic();
  // const publicUrl = `https://storage.googleapis.com/${bucket.name}/${encodeURIComponent(filename)}`;
  // return { url: publicUrl, path: filename };

  // En la práctica, para evitar permisos del bucket, usamos URL firmada de lectura “larga”:
  const [signedUrl] = await file.getSignedUrl({
    action: 'read',
    expires: '2100-01-01',
  });

  return { url: signedUrl, path: filename };
};
