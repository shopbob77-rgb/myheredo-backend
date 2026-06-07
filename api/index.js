const admin = require("firebase-admin");
const QRCode = require('qrcode');
const speakeasy = require('speakeasy');

if (!admin.apps.length) {
    const serviceAccount = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT, 'base64').toString('utf8'));
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}
const db = admin.firestore();

module.exports = async (req, res) => {
    // Nagłówki CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') return res.status(200).end();

    try {
        const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
        
        if (!body || !body.action) {
            return res.status(400).json({ error: "Brak akcji w żądaniu" });
        }

        // --- 1. REJESTRACJA ---
        if (body.action === 'register_user') {
            const email = body.payload ? body.payload.email : null;
            if (!email) return res.status(400).json({ error: "Brak adresu email" });

            const secret = speakeasy.generateSecret({
                name: `MyHeredo (${email})`
            });

            await db.collection('users').doc(email).set({ 
                email: email, 
                twoFactorSecret: secret.base32,
                status: 'pending_2fa',
                createdAt: new Date().toISOString()
            });

            const qrData = await QRCode.toDataURL(secret.otpauth_url);

            return res.status(200).json({ 
                success: true, 
                qrCode: qrData,
                secretCode: secret.base32
            });
        }

        // --- 2. WERYFIKACJA KODU (Dopasowana do Twojego frontendu!) ---
        if (body.action === 'verify_2fa_and_activate' || body.action === 'verify_2fa' || body.action === 'check_2fa') {
            const email = body.payload ? body.payload.email : null;
            const code = body.payload ? body.payload.code : null;

            if (!email || !code) {
                return res.status(400).json({ error: "Brak adresu email lub kodu tokena" });
            }

            const userDoc = await db.collection('users').doc(email).get();
            if (!userDoc.exists) return res.status(404).json({ error: "Użytkownik nie istnieje w bazie" });
            
            const userData = userDoc.data();
            const savedSecret = userData.twoFactorSecret;

            const verified = speakeasy.totp.verify({
                secret: savedSecret,
                encoding: 'base32',
                token: code.trim(),
                window: 2 // Tolerancja czasowa na wypadek spieszącego/spóźniającego się zegarka w telefonie
            });

            if (verified) {
                await db.collection('users').doc(email).update({ status: 'active' });
                return res.status(200).json({ success: true, message: "Autoryzacja pomyślna!" });
            } else {
                return res.status(400).json({ success: false, error: "Kod niepoprawny lub wygasł. Spróbuj ponownie." });
            }
        }

        return res.status(404).json({ error: `Nieznana akcja: ${body.action}` });

    } catch (error) {
        console.error("Błąd serwera:", error);
        return res.status(500).json({ error: error.message });
    }
};
