const admin = require("firebase-admin");

// Konfiguracja Firebase
if (!admin.apps.length) {
  try {
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
  // Nagłówki CORS - aby przeglądarka nie blokowała Twojej strony
  res.setHeader('Access-Control-Allow-Origin', 'https://myheredo.pl');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    // Przykład: pobieranie danych z kolekcji 'notatki'
    const snapshot = await db.collection('notatki').get();
    const dane = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    
    res.status(200).json(dane);
  } catch (error) {
    console.error("Błąd API:", error);
    res.status(500).json({ error: "Błąd serwera", details: error.message });
  }
};
