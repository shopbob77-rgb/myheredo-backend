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
  // 🔥 BEZWZGLĘDNE USTAWIENIE NAGŁÓWKÓW CORS DLA KAŻDEGO ŻĄDANIA
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*'); 
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS, PATCH, DELETE, POST, PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization');

  // Obsługa zapytania wstępnego (Preflight OPTIONS) - Przeglądarka pyta, czy może wysłać POST
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Zabezpieczenie przed bezpośrednim wejściem z przeglądarki (GET)
  if (req.method === 'GET') {
    return res.status(200).json({ 
      status: "online", 
      message: "MyHeredo API działa. Oczekuję na żądania typu POST z frontendu." 
    });
  }

  // Bezpieczne parsowanie zawartości body (żądania POST)
  let body = {};
  try {
    if (req.body) {
      body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    } else if (req.rawBody) {
      body = JSON.parse(req.rawBody.toString('utf8'));
    }
  } catch (e) {
    console.error("Błąd parsowania JSON:", e);
    return res.status(400).json({ error: "Nieprawidłowy format danych JSON." });
  }

  const action = body.action;
  const payload = body.payload || {};

  if (!action) {
    return res.status(400).json({ error: "Brak zdefiniowanej akcji w żądaniu." });
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
        return res.status(400).json({ error: "Brak kategorii." });
      }

      await vaultDocRef.set({
        vaultData: {
          [category]: content
        }
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
