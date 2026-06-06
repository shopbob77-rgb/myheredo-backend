const admin = require("firebase-admin");

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
  // Nagłówki CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // 🔥 BEZPIECZNIK LOGÓW: Jeśli to zwykłe wejście przez przeglądarkę (GET), nie szukaj logiki, tylko zwróć status
  if (req.method === 'GET') {
    return res.status(200).json({ 
      status: "online", 
      message: "MyHeredo API działa poprawnie. Oczekuję na zapytania POST z aplikacji." 
    });
  }

  // Bezpieczne parsowanie body dla zapytań POST
  let body = {};
  if (req.body) {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  }

  const action = body.action;
  const payload = body.payload || {};

  // Identyfikator dokumentu w Firestore
  const vaultDocRef = db.collection('vaults').doc('user_secure_vault');

  try {
    /**
     * AKCJA 1: Pobieranie danych przy logowaniu
     */
    if (action === 'get_vault') {
      const doc = await vaultDocRef.get();
      if (doc.exists) {
        return res.status(200).json(doc.data());
      } else {
        const initialStructure = {
          vaultData: { bank: "", crypto: "", business: "", social: "" },
          categoryNames: { bank: "Banki & Finanse", crypto: "Kryptowaluty", business: "Biznes & Firmy", social: "Social Media" },
          heirs: []
        };
        return res.status(200).json(initialStructure);
      }
    } 
    
    /**
     * AKCJA 2: Zapisywanie pojedynczej skrytki (Vercel Sync)
     */
    else if (action === 'add_note') {
      const { category, content } = payload;
      if (!category) {
        return res.status(400).json({ error: "Brak zdefiniowanej kategorii skrytki." });
      }

      await vaultDocRef.set({
        vaultData: {
          [category]: content
        }
      }, { merge: true });

      return res.status(200).json({ success: true });
    } 
    
    /**
     * AKCJA 3: Uzbrojenie systemu i generowanie Certyfikatu
     */
    else if (action === 'activate_succession') {
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
