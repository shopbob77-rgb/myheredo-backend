const admin = require("firebase-admin");

// 1. Inicjalizacja poza główną funkcją (lepsza wydajność w Vercel)
if (!admin.apps.length) {
  try {
    const rawKey = process.env.FIREBASE_SERVICE_ACCOUNT;
    
    if (!rawKey) {
      console.warn("UWAGA: Brak zmiennej FIREBASE_SERVICE_ACCOUNT!");
    } else {
      const serviceAccount = JSON.parse(
        Buffer.from(rawKey, 'base64').toString('utf8')
      );

      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
      });
      console.log("Firebase zainicjalizowany.");
    }
  } catch (error) {
    console.error("Błąd inicjalizacji Firebase:", error.message);
  }
}

// 2. Pobranie referencji do bazy danych
const db = admin.apps.length ? admin.firestore() : null;

module.exports = async (req, res) => {
  // Nagłówki CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();

  // 3. Dodatkowe zabezpieczenie: sprawdzenie czy db w ogóle istnieje
  if (!db) {
    return res.status(500).json({ error: "Firebase nie został poprawnie zainicjalizowany." });
  }

  try {
    // 4. Optymalizacja: sprawdzenie metody
    if (req.method !== 'GET') {
      return res.status(405).json({ error: "Metoda niedozwolona" });
    }

    const snapshot = await db.collection('notatki').get();
    const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    
    return res.status(200).json(data);
  } catch (error) {
    console.error("Błąd API:", error);
    return res.status(500).json({ error: "Błąd serwera: " + error.message });
  }
};
