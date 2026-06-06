const admin = require("firebase-admin");

// Inicjalizacja Firebase Admin - tylko jeśli jeszcze nie jest zainicjowane
if (!admin.apps.length) {
  try {
    // Odczytujemy zmienną środowiskową zakodowaną w Base64 i zamieniamy na JSON
    const serviceAccountJson = Buffer.from(
      process.env.FIREBASE_SERVICE_ACCOUNT,
      'base64'
    ).toString('utf8');
    
    const serviceAccount = JSON.parse(serviceAccountJson);

    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
  } catch (error) {
    console.error("Błąd inicjalizacji Firebase:", error);
  }
}

const db = admin.firestore();

// Główna funkcja obsługująca zapytania
module.exports = async (req, res) => {
  // Pozwalamy na komunikację z różnych domen (CORS), jeśli Twój frontend jest pod innym adresem
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    // Obsługa pobierania notatek (GET)
    if (req.method === 'GET') {
      const snapshot = await db.collection('notes').get();
      const notes = snapshot.docs.map(doc => ({ 
        id: doc.id, 
        ...doc.data() 
      }));
      return res.status(200).json(notes);
    }

    // Obsługa zapisu notatki (POST)
    if (req.method === 'POST') {
      const { content, userEmail } = req.body;
      
      if (!content) {
        return res.status(400).json({ error: "Brak treści notatki" });
      }

      const docRef = await db.collection('notes').add({
        content: content,
        userEmail: userEmail || 'anonim',
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });

      return res.status(200).json({ 
        id: docRef.id, 
        status: "SUCCESS" 
      });
    }

    res.status(405).json({ error: "Method not allowed" });
  } catch (error) {
    console.error("Błąd serwera:", error);
    res.status(500).json({ error: "Wewnętrzny błąd serwera" });
  }
};
