const admin = require("firebase-admin");

if (!admin.apps.length) {
  try {
    const serviceAccount = JSON.parse(
      Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT, 'base64').toString('utf8')
    );
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  } catch (err) {
    console.error("Błąd inicjalizacji Firebase:", err);
  }
}

const db = admin.firestore();

module.exports = async (req, res) => {
  // Nagłówki CORS dla pełnej komunikacji cross-origin
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method === 'GET') {
    return res.status(200).json({ 
      status: "online", 
      message: "MyHeredo API działa. Oczekuję na żądania POST." 
    });
  }

  // 🔥 PANACEUM NA UNDEFINED REQ.BODY:
  // Bezpieczne wyciąganie body z obiektów Vercela na 3 sposoby
  let body = {};
  try {
    if (req.body) {
      body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    } else if (req.rawBody) {
      body = JSON.parse(req.rawBody.toString('utf8'));
    }
  } catch (e) {
    console.error("Błąd parsowania JSON w backendzie:", e);
    return res.status(400).json({ error: "Nieprawidłowy format danych JSON." });
  }

  // Wyciągamy dane z zabezpieczonego obiektu body
  const action = body.action;
  const payload = body.payload || {};

  // Jeśli frontend w ogóle nie przysłał akcji
  if (!action) {
    return res.status(400).json({ error: "Brak zdefiniowanej akcji (action) w żądaniu." });
  }

  const vaultDocRef = db.collection('vaults').doc('user_secure_vault');

  try {
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
    
    else if (action === 'add_note') {
      const { category, content } = payload;
      if (!category) {
        return res.status(400).json({ error: "Brak zdefiniowanej kategorii skrytki." });
      }

      await vaultDocRef.set({
        vaultData: { [category]: content }
      }, { merge: true });

      return res.status(200).json({ success: true });
    } 
    
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
    console.error("Błąd Firebase:", error);
    return res.status(500).json({ error: error.message });
  }
};
      return res.status(400).json({ error: "Nieznana akcja: " + action });
    }

  } catch (error) {
    console.error("Błąd krytyczny bazy danych:", error);
    return res.status(500).json({ error: error.message });
  }
};
