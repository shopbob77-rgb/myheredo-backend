const admin = require("firebase-admin");

// Inicjalizacja Firebase z obsługą błędów i zabezpieczeniem przed duplikacją
if (!admin.apps.length) {
  try {
    const rawKey = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (!rawKey) {
      throw new Error("Zmienna FIREBASE_SERVICE_ACCOUNT nie istnieje!");
    }

    // Dekodowanie Base64 na czytelny JSON
    const serviceAccount = JSON.parse(
      Buffer.from(rawKey, 'base64').toString('utf8')
    );

    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
    console.log("Firebase zainicjalizowany pomyślnie.");
  } catch (error) {
    console.error("KRYTYCZNY BŁĄD INICJALIZACJI:", error.message);
  }
}

const db = admin.firestore();

module.exports = async (req, res) => {
  // Nagłówki CORS - zezwolenie dla przeglądarki
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  // Obsługa zapytania wstępnego (preflight)
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    // Pobieranie danych z bazy
    const snapshot = await db.collection('notes').get();
    const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    
    res.status(200).json(data);
  } catch (error) {
    console.error("Błąd API:", error);
    res.status(500).json({ error: "Błąd serwera: " + error.message });
  }
};
