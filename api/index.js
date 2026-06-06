const admin = require("firebase-admin");

// Inicjalizacja Firebase (Twoja bezpieczna metoda base64)
if (!admin.apps.length) {
  try {
    const serviceAccount = JSON.parse(
      Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT, 'base64').toString('utf8')
    );
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
  } catch (err) {
    console.error("Błąd inicjalizacji Firebase:", err);
  }
}

const db = admin.firestore();

module.exports = async (req, res) => {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Bezpieczne parsowanie body zapytania
  let body = {};
  if (req.body) {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  }

  const action = body.action;
  const payload = body.payload || {};

  // Identyfikator sejfu (na tym etapie używamy stałego dokumentu użytkownika)
  const vaultDocRef = db.collection('vaults').doc('user_secure_vault');

  try {
    /**
     * AKCJA 1: Pobieranie danych przy logowaniu (Pojawia się na ekranie nr 1)
     */
    if (action === 'get_vault') {
      const doc = await vaultDocRef.get();
      
      if (doc.exists) {
        // Jeśli sejf istnieje w bazie, zwracamy jego zawartość
        return res.status(200).json(doc.data());
      } else {
        // Jeśli użytkownik loguje się pierwszy raz, zwracamy pustą strukturę startową
        const initialStructure = {
          vaultData: { bank: "", crypto: "", business: "", social: "" },
          categoryNames: { bank: "Banki & Finanse", crypto: "Kryptowaluty", business: "Biznes & Firmy", social: "Social Media" },
          heirs: []
        };
        return res.status(200).json(initialStructure);
      }
    } 
    
    /**
     * AKCJA 2: Zapisywanie pojedynczej skrytki w locie (Wywoływane przez modal i triggerVaultSave)
     */
    else if (action === 'add_note') {
      const { category, content } = payload;
      
      if (!category) {
        return res.status(400).json({ error: "Brak zdefiniowanej kategorii skrytki." });
      }

      // Aktualizujemy tylko jedno konkretne pole wewnątrz obiektu vaultData w Firestore
      // Dzięki temu nie nadpisujemy pozostałych skrytek!
      await vaultDocRef.set({
        vaultData: {
          [category]: content
        }
      }, { merge: true });

      return res.status(200).json({ success: true });
    } 
    
    /**
     * AKCJA 3: Uzbrojenie systemu i generowanie Certyfikatu (Ostatni ekran nr 5)
     */
    else if (action === 'activate_succession') {
      // Zapisujemy cały zebrany stan aplikacji (skrytki, spadkobiercy, czas DMS)
      await vaultDocRef.set({
        vaultData: payload.vaultData,
        categoryNames: payload.categoryNames,
        heirs: payload.heirs,
        dmsTimeoutDays: payload.dmsTimeoutDays,
        activatedAt: payload.activatedAt,
        systemStatus: "ACTIVE"
      }, { merge: true });

      return res.status(200).json({ success: true });
    } 
    
    else {
      return res.status(400).json({ error: "Nieznana akcja: " + action });
    }

  } catch (error) {
    console.error("Błąd krytyczny bazy danych:", error);
    return res.status(500).json({ error: error.message });
  }
};
