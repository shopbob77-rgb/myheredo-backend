const admin = require("firebase-admin");
const speakeasy = require("speakeasy");
const qrcode = require("qrcode");

if (!admin.apps.length) {
  try {
    const serviceAccount = JSON.parse(
      Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT, 'base64').toString('utf8')
    );
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  } catch (err) {
    console.error("Błąd Firebase:", err);
  }
}

const db = admin.firestore();

module.exports = async (req, res) => {
  // Wymuszenie nagłówków CORS dla każdej metody
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

  // 🔥 ABSOLUTNIE PANCERNE PARSOWANIE BODY
  let body = {};
  try {
    if (req.body) {
      body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    } else if (req.rawBody) {
      body = JSON.parse(req.rawBody.toString('utf8'));
    } else {
      // Jeśli Vercel schował dane głęboko w strumieniu żądania
      const buffers = [];
      for await (const chunk of req) {
        buffers.push(chunk);
      }
      const data = Buffer.concat(buffers).toString();
      if (data) body = JSON.parse(data);
    }
  } catch (e) {
    console.error("Błąd dekodowania JSON:", e);
    // Nie wyrzucaj błędu 400 od razu, pozwól zdebuggować
  }

  const action = body.action;
  const payload = body.payload || {};

  // Jeśli po tym wszystkim nadal nie ma akcji, zwracamy czytelny komunikat debugowania
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
      if (userCheck.exists) {
        // Dla ułatwienia pokazu: jeśli istnieje, po prostu wygeneruj nowy kod QR zamiast rzucać błędem
        const userData = userCheck.data();
        const qrCodeDataUrl = await qrcode.toDataURL(`otpauth://totp/MyHeredo:${email}?secret=${userData.twoFactorSecret}&issuer=MyHeredo`);
        return res.status(200).json({ success: true, qrCode: qrCodeDataUrl });
      }

      // Generowanie sekretu 2FA
      const secret = speakeasy.generateSecret({ name: `MyHeredo (${email})` });
      const qrCodeDataUrl = await qrcode.toDataURL(secret.otpauth_url);

      // Zapis w Firestore
      await db.collection('users').doc(email).set({
        email: email,
        twoFactorSecret: secret.base32,
        twoFactorEnabled: false,
        createdAt: new Date().toISOString()
      });

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
        window: 2
      });

      if (verified) {
        await db.collection('users').doc(email).update({ twoFactorEnabled: true });
        return res.status(200).json({ success: true });
      } else {
        return res.status(400).json({ error: "Błędny kod 2FA." });
      }
    }

    // Domyślny fallback dla pozostałych akcji (z poprzednich wersji)
    return res.status(400).json({ error: "Nieznana akcja: " + action });

  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};
