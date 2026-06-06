const admin = require("firebase-admin");

// Inicjalizacja Firebase (bezpieczna)
if (!admin.apps.length) {
  try {
    // Zakładamy, że klucz jest w zmiennej środowiskowej w formacie Base64
    const serviceAccount = JSON.parse(
      Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT, 'base64').toString('utf8')
    );
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
  } catch (error) {
    console.error("Błąd inicjalizacji Firebase:", error);
  }
}

const db = admin.firestore();

module.exports = async (req, res) => {
  // 1. Zezwolenie na połączenie z Twojej domeny (CORS)
  res.setHeader('Access-Control-Allow-Origin', 'https://myheredo.pl');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  // 2. Obsługa zapytania typu OPTIONS (wymagane przez przeglądarkę)
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // 3. Logika API
  try {
    const snapshot = await db.collection('notatki').get();
    const dane = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    res.status(200).json(dane);
  } catch (error) {
    console.error("Błąd API:", error);
    res.status(500).json({ error: "Błąd serwera", details: error.message });
  }
};
