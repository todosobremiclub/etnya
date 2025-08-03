const fs = require('fs');

const keyJson = require('./serviceAccountKey.json');
const keyFormatted = keyJson.private_key.replace(/\n/g, '\\n');

console.log('FIREBASE_PRIVATE_KEY=' + keyFormatted);
