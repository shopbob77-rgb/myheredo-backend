const admin = require("firebase-admin");
const speakeasy = require("speakeasy");
const qrcode = require("qrcode");

if (!admin.apps.length) {
  try {
    const serviceAccount = JSON.parse(
      Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT, 'base64').toString('utf8')
    );
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  } catch (err) (
    console.error("Błąd Firebase:", err);
  }
}

const db = admin.firestore();

module.exports = async (req, res) => {
  // Wymuszenie nagłówków CORS dla każdej metody - dokładnie jak w Twoim oryginale
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS, POST');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method === 'GET') {
    return res.status(200).json({ status: "online", message: "MyHeredo API gotowe." });
  }

  // 🔥 ABSOLUTNIE PANCERNE PARSOWANIE BODY Z TWOJEJ PIERWSZEJ WERSJI
  let body = {};
  try {
    if (req.body) {
      body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    } else if (req.rawBody) {
      body = JSON.parse(req.rawBody.toString('utf8'));
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
  }

  const action = body.action;
  const payload = body.payload || {};

  if (!action) {
    return res.status(400).json({ 
      error: "Odebrano puste żądanie (brak pola action).",
      receivedMethod: req.method,
      receivedHeaders: req.headers,
      parsedBody: body
    });
  }

  try {
    if (action === 'register_user') {
      const { email } = payload;
      if (!email) return res.status(400).json({ error: "Brak adresu email." });

      // Sprawdzenie czy użytkownik istnieje
      const userCheck = await db.collection('users').doc(email).get();
      
      let secretBase32;

      if (userCheck.exists) {
        const userData = userCheck.data();
        secretBase32 = userData.twoFactorSecret;
      } else {
        // Twój oryginalny sposób generowania sekretu speakeasy
        const secret = speakeasy.generateSecret({ name: `MyHeredo` });
        // Zabezpieczenie: usuwamy znaki '=' (padding), które psują import w aplikacjach mobilnych
        secretBase32 = secret.base32.replace(/=/g, '').toUpperCase();

        // Zapis w Firestore - dokładnie Twoja oryginalna struktura pól
        await db.collection('users').doc(email).set({
          email: email,
          twoFactorSecret: secretBase32,
          twoFactorEnabled: false,
          createdAt: new Date().toISOString()
        });
      }

      // 🛠️ POPRAWKA QR: Kodowanie komponentów, aby znaki takie jak '@' nie niszczyły linku TOTP
      const issuer = "MyHeredo";
      const pureOtpauthUrl = `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(email)}?secret=${secretBase32}&issuer=${encodeURIComponent(issuer)}`;
      
      // Twój oryginalny generator qrcode
      const qrCodeDataUrl = await qrcode.toDataURL(pureOtpauthUrl);

      return res.status(200).json({
        success: true,
        qrCode: qrCodeDataUrl
      });
    }

    if (action === 'verify_2fa_and_activate') {
      const { email, token } = payload;
      const userDoc = await db.collection('users').doc(email).get();

      if (!userDoc.exists) return res.status(404).json({ error: "Użytkownik nie istnieje." });
      
      const verified = speakeasy.totp.verify({
        secret: userDoc.data().twoFactorSecret,
        encoding: 'base32',
        token: token,
        window: 2 // Twoje oryginalne okno tolerancji czasu
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
