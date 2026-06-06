const admin = require("firebase-admin");

if (!admin.apps.length) {
  const serviceAccount = JSON.parse(
    Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT, 'base64').toString('utf8')
  );
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}

const db = admin.firestore();

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();

  // RĘCZNE PARSOWANIE CIAŁA ZAPYTANIA (naprawa błędu undefined)
  let body = {};
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  } catch (e) {
    // Jeśli nie udało się sparsować, zostawiamy pusty obiekt
  }

  const { action, payload } = body;

  try {
    if (action === 'get_vault') {
      const snapshot = await db.collection('notes').get();
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      res.status(200).json(data);
    } 
    else if (action === 'add_note') {
      const docRef = await db.collection('notes').add({
        content: payload.content,
        createdAt: new Date().toISOString()
      });
      res.status(200).json({ success: true, id: docRef.id });
    } else {
      res.status(400).json({ error: "Nieznana akcja: " + action });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
