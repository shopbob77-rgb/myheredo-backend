const admin = require("firebase-admin");
const speakeasy = require("speakeasy");
const qrcode = require("qrcode");

if (!admin.apps.length) {
  try {
    const serviceAccount = JSON.parse(
      Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT, 'base64').toString('utf8')
    );
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  } catch (err) { // <--- NAPRAWIONE: Prawidłowy nawias klamrowy {
    console.error("Błąd Firebase:", err);
  }
}

const db = admin.firestore();

module.exports = async (req, res) => {
  // 1. USTAWIEŃ NAGŁÓWKÓW CORS (Zanim serwer zrobi cokolwiek innego)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, PUT, PATCH, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization');

  // Obsługa żądań wstępnych OPTIONS (Preflight request)
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Prosty test działania endpointu przez GET
  if (req.method === 'GET') {
    return res.status(200).json({ status: "online", message: "MyHeredo API gotowe." });
  }

  // 2. BEZPIECZNE PARSOWANIE BODY (Stream-buffer dla Vercel Serverless)
  let body = {};
  try {
    if (req.body) {
      body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    } else {
      const buffers = [];
      for await (const chunk of req) {
        buffers.push(chunk);
      }
      const data = Buffer.concat(buffers).toString();
      if (data) body = JSON.parse(data);
    }
  } catch (e) {
    console.error("Błąd dekodowania JSON:", e);
    return res.status(400).json({ error: "Błędny format danych JSON." });
  }

  const action = body.action;
  const payload = body.payload || {};

  if (!action) {
    return res.status(400).json({ error: "Brak zdefiniowanego pola 'action' w żądaniu." });
  }

  try {
    // REJESTRACJA UŻYTKOWNIKA I GENEROWANIE QR
    if (action === 'register_user') {
      const { email } = payload;
      if (!email) return res.status(400).json({ error: "Brak adresu email." });

      const userCheck = await db.collection('users').doc(email).get();
      let secretBase32;

      if (userCheck.exists) {
        secretBase32 = userCheck.data().twoFactorSecret;
      } else {
        // Generujemy bezpieczny sekret o stałej długości
        const secret = speakeasy.generateSecret({ length: 20 });
        // Bezwzględnie usuwamy znaki '=', które uniemożliwiają import w aplikacjach mobilnych
        secretBase32 = secret.base32.toUpperCase().replace(/=/g, '');

        await db.collection('users').doc(email).set({
          email: email,
          twoFactorSecret: secretBase32,
          twoFactorEnabled: false,
          createdAt: new Date().toISOString()
        });
      }

      // 🛠️ GENEROWANIE LINKU TOTP (Bezpiecznie zakodowane komponenty)
      const issuer = "MyHeredo";
      const pureOtpauthUrl = `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(email)}?secret=${secretBase32}&issuer=${encodeURIComponent(issuer)}`;
      
      // Konwersja linku na obrazek QR w formacie Base64 DataURL
      const qrCodeDataUrl = await qrcode.toDataURL(pureOtpauthUrl);

      return res.status(200).json({
        success: true,
        qrCode: qrCodeDataUrl
      });
    }

    // WERYFIKACJA KODU Z APLIKACJI (2FA)
    if (action === 'verify_2fa_and_activate') {
      const { email, token } = payload;
      if (!email || !token) return res.status(400).json({ error: "Brak e-maila lub tokenu w żądaniu." });

      const userDoc = await db.collection('users').doc(email).get();
      if (!userDoc.exists) return res.status(404).json({ error: "Użytkownik nie istnieje." });
      
      const verified = speakeasy.totp.verify({
        secret: userDoc.data().twoFactorSecret,
        encoding: 'base32',
        token: token,
        window: 2 // Tolerancja +/- 60 sekund na przesunięcia czasu w telefonach
      });

      if (verified) {
        await db.collection('users').doc(email).update({ twoFactorEnabled: true });
        return res.status(200).json({ success: true });
      } else {
        return res.status(400).json({ error: "Błędny kod 2FA." });
      }
    }

    return res.status(400).json({ error: "Nieznana akcja: " + action });

  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};
