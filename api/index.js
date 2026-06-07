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
    console.error("Błąd inicjalizacji Firebase Admin:", err);
  }
}

const db = admin.firestore();

module.exports = async (req, res) => {
  // Nagłówki CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: "Wymagane POST" });

  // Parsowanie body
  let body;
  try {
    const buffers = [];
    for await (const chunk of req) buffers.push(chunk);
    body = JSON.parse(Buffer.concat(buffers).toString());
  } catch (e) {
    return res.status(400).json({ error: "Błędne JSON w body" });
  }

  const { action, payload } = body;

  try {
    // 1. REJESTRACJA
    if (action === 'register_user') {
      const { email } = payload;
      if (!email) return res.status(400).json({ error: "Brak email" });

      const userDoc = await db.collection('users').doc(email).get();
      
      let secret;
      if (userDoc.exists) {
        secret = userDoc.data().twoFactorSecret;
      } else {
        secret = speakeasy.generateSecret({ name: `MyHeredo (${email})` }).base32;
        await db.collection('users').doc(email).set({
          email,
          twoFactorSecret: secret,
          twoFactorEnabled: false,
          createdAt: new Date().toISOString()
        });
      }

      const otpauth_url = speakeasy.otpauthURL({ secret, label: email, issuer: 'MyHeredo' });
      const qrCodeDataUrl = await qrcode.toDataURL(otpauth_url);

      return res.status(200).json({ success: true, qrCode: qrCodeDataUrl });
    }

    // 2. WERYFIKACJA 2FA
    if (action === 'verify_2fa_and_activate') {
      const { email, token } = payload;
      const userDoc = await db.collection('users').doc(email).get();

      if (!userDoc.exists) return res.status(404).json({ error: "Użytkownik nie istnieje" });

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
        return res.status(400).json({ error: "Błędny kod 2FA" });
      }
    }

    return res.status(400).json({ error: "Nieznana akcja" });

  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};
