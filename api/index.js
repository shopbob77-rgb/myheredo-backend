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

  const body = req.body || {};
  const { action } = body;

  try {
    if (action === 'get_vault') {
      // Pobieramy nienaruszony stan skrytek sukcesyjnych dla klienta
      const docRef = db.collection('vaults').doc('default_user_vault');
      const doc = await docRef.get();

      if (doc.exists) {
        // Zwracamy dokładnie to, na co czeka Twój frontend: res.vaultData
        res.status(200).json({ vaultData: doc.data() });
      } else {
        // Jeśli dokument nie istnieje, zwracamy strukturę domyślną z Twoimi skrytkami
        const defaultVault = {
          "Testament i Wola": "Zaszyfrowano",
          "Osoby Uposażone": "Zdefiniowano (Jan Kowalski)",
          "Polisy i Ubezpieczenia": "",
          "Konta i Aktywa Cyfrowe": "Zabezpieczone"
        };
        res.status(200).json({ vaultData: defaultVault });
      }
    } else {
      res.status(400).json({ error: "Unknown action" });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
