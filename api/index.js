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
        // Generujemy bezpieczny, czysty klucz bez znaków specjalnych i paddingu '='
        const secret = speakeasy.generateSecret({ 
          length: 20, 
          name: `MyHeredo`
        });
        
        // Czyszczenie klucza na wypadek, gdyby speakeasy dodało znaki dopełnienia
        secretBase32 = secret.base32.replace(/=/g, '').toUpperCase();

        await db.collection('users').doc(email).set({
          email: email,
          twoFactorSecret: secretBase32,
          twoFactorEnabled: false,
          createdAt: new Date().toISOString()
        });
      }

      // 🛠️ ROZWIĄZANIE PROBLEMU QR: Pełne kodowanie URI znaków specjalnych (np. dwukropka i małpy @)
      const issuer = "MyHeredo";
      const label = email;
      
      // Oficjalny format: otpauth://totp/Issuer:Label?secret=SECRET&issuer=Issuer
      const pureOtpauthUrl = `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(label)}?secret=${secretBase32}&issuer=${encodeURIComponent(issuer)}`;
      
      // Wygenerowanie kodu QR z wyższym stopniem korekcji błędów 'M' dla bezbłędnego skanowania aparatami
      const qrCodeDataUrl = await qrcode.toDataURL(pureOtpauthUrl, {
        errorCorrectionLevel: 'M',
        margin: 2
      });

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
        window: 2 // Akceptacja kodów spóźnionych/przyspieszonych o 30s ze względu na desynchronizację zegarów
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
