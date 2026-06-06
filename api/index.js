const admin = require("firebase-admin");

if (!admin.apps.length) {
  try {
    const serviceAccount = JSON.parse(
      Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT, 'base64').toString('utf8')
    );
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  } catch (err) {
    console.error("Firebase init error:", err);
  }
}

const db = admin.firestore();

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();

  let body = {};
  try {
    if (req.body) {
      body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    }
  } catch (e) {
    return res.status(400).json({ error: "Invalid JSON" });
  }

  const { action, payload } = body;

  try {
    if (action === 'get_vault') {
      const snapshot = await db.collection('notes').get();
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      return res.status(200).json(data);
    } 
    else if (action === 'add_note') {
      if (!payload || !payload.content) return res.status(400).json({ error: "Missing content" });
      const docRef = await db.collection('notes').add({
        content: payload.content,
        createdAt: new Date().toISOString()
      });
      return res.status(200).json({ success: true, id: docRef.id });
    }
    return res.status(400).json({ error: "Unknown action" });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};
