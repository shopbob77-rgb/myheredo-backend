const admin = require("firebase-admin");
const QRCode = require('qrcode');
const speakeasy = require('speakeasy');

if (!admin.apps.length) {
    const serviceAccount = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT, 'base64').toString('utf8'));
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}
const db = admin.firestore();

module.exports = async (req, res) => {
    // Pełne nagłówki CORS dla stabilnej komunikacji między domenami
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') return res.status(200).end();

    try {
        const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
        
        // Krytyczne logowanie: Zobaczymy w panelu Vercel co dokładnie wysyła Twój frontend
        console.log("Otrzymano zapytanie POST. Wykryta akcja:", body ? body.action : "BRAK AKCJI");

        if (!body || !body.action) {
            return res.status(400).json({ error: "Brak zdefiniowanej akcji w formacie JSON" });
        }

        // --- 1. REJESTRACJA UŻYTKOWNIKA I GENEROWANIE QR ---
        if (body.action === 'register_user') {
            const email = body.payload ? body.payload.email : null;
            if (!email) return res.status(400).json({ error: "Brak adresu email w payloadzie" });

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

        // --- 2. WERYFIKACJA KODU 2FA (Obsługuje obie potencjalne nazwy akcji z frontendu) ---
        if (body.action === 'verify_2fa' || body.action === 'check_2fa') {
            const email = body.payload ? body.payload.email : null;
            const code = body.payload ? body.payload.code : null;

            if (!email || !code) {
                return res.status(400).json({ error: "Brak wymaganego adresu email lub kodu weryfikacyjnego" });
            }

            const userDoc = await db.collection('users').doc(email).get();
            if (!userDoc.exists) return res.status(404).json({ error: "Użytkownik nie został znaleziony w bazie danych" });
            
            const userData = userDoc.data();
            const savedSecret = userData.twoFactorSecret;

            const verified = speakeasy.totp.verify({
                secret: savedSecret,
                encoding: 'base32',
                token: code.trim(),
                window: 2 // Zwiększona tolerancja czasowa (+/- 60 sekund) na wypadek przesunięcia zegara w telefonie
            });

            if (verified) {
                await db.collection('users').doc(email).update({ status: 'active' });
                return res.status(200).json({ success: true, message: "Autoryzacja 2FA zakończona sukcesem" });
            } else {
                return res.status(400).json({ success: false, error: "Wprowadzony kod jest niepoprawny lub stracił ważność" });
            }
        }

        // Jeśli frontend przysłał coś zupełnie innego (np. activate_succession)
        console.log(`Zgłoszono nieobsługiwaną akcję: ${body.action}`);
        return res.status(404).json({ error: `Nieznana akcja: ${body.action}` });

    } catch (error) {
        console.error("KRYTYCZNY BŁĄD SERWERA:", error);
        return res.status(500).json({ error: error.message });
    }
};
