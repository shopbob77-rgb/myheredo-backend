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
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  let body = {};
  try {
    const buffers = [];
    for await (const chunk of req) buffers.push(chunk);
    body = JSON.parse(Buffer.concat(buffers).toString());
  } catch (e) {
    return res.status(400).json({ error: "Błędny JSON w body" });
  }

  const action = body.action;
  const payload = body.payload || {};

  try {
    if (action === 'register_user') {
      const { email } = payload;
      if (!email) return res.status(400).json({ error: "Brak adresu email." });

      const userCheck = await db.collection('users').doc(email).get();
      
      let secretBase32;

      if (userCheck.exists) {
        secretBase32 = userCheck.data().twoFactorSecret;
      } else {
        const secret = speakeasy.generateSecret({ name: `MyHeredo` });
        secretBase32 = secret.base32;

        await db.collection('users').doc(email).set({
          email: email,
          twoFactorSecret: secretBase32,
          twoFactorEnabled: false,
          createdAt: new Date().toISOString()
        });
      }

      // 🛠️ PRZYWRÓCENIE PANCERNEGO FORMATU LINKU TOTP (Bez zbędnych znaków, czysty e-mail i issuer)
      const pureOtpauthUrl = `otpauth://totp/MyHeredo:${email}?secret=${secretBase32}&issuer=MyHeredo`;
      const qrCodeDataUrl = await qrcode.toDataURL(pureOtpauthUrl);

      return res.status(200).json({ success: true, qrCode: qrCodeDataUrl });
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

    return res.status(400).json({ error: "Nieznana akcja" });

  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};
