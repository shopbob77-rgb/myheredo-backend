const admin = require("firebase-admin");

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  try {
    const rawKey = process.env.FIREBASE_SERVICE_ACCOUNT;
    console.log("Długość klucza:", rawKey ? rawKey.length : "BRAK KLUCZA");
    
    if (!admin.apps.length) {
      const serviceAccount = JSON.parse(
        Buffer.from(rawKey, 'base64').toString('utf8')
      );
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
      });
    }
    
    const db = admin.firestore();
    const snapshot = await db.collection('notatki').get();
    res.status(200).json(snapshot.docs.map(doc => doc.data()));
  } catch (error) {
    console.error("DEBUG BŁĘDU:", error.message);
    res.status(500).json({ error: error.message, stack: error.stack });
  }
};
