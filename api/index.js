const admin = require("firebase-admin");
const QRCode = require('qrcode');
const speakeasy = require('speakeasy'); // Używamy Twojej biblioteki z package.json

if (!admin.apps.length) {
    const serviceAccount = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT, 'base64').toString('utf8'));
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}
const db = admin.firestore();

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') return res.status(200).end();

    try {
        const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;

        // --- AKCJA 1: REJESTRACJA I GENEROWANIE PRAWDZIWEGO KODU QR ---
        if (body.action === 'register_user') {
            const email = body.payload ? body.payload.email : null;
            if (!email) return res.status(400).json({ error: "Brak adresu email" });

            // Generujemy sekret za pomocą speakeasy
            const secret = speakeasy.generateSecret({
                name: `MyHeredo (${email})`
            });

            // Zapisujemy użytkownika oraz jego SECRET w bazie Firebase
            await db.collection('users').doc(email).set({ 
                email: email, 
                twoFactorSecret: secret.base32, // Zapisujemy unikalny klucz w formacie base32
                status: 'pending_2fa',
                createdAt: new Date().toISOString()
            });

            // Generujemy kod QR z oficjalnego linku otpauthUrl, który telefon zrozumie
            const qrData = await QRCode.toDataURL(secret.otpauth_url);

            return res.status(200).json({ 
                success: true, 
                qrCode: qrData,
                secretCode: secret.base32 // Kod tekstowy (awaryjny)
            });
        }

        // --- AKCJA 2: WERYFIKACJA 6-CYFROWEGO KODU Z TELEFONU ---
        if (body.action === 'verify_2fa') {
            const { email, code } = body.payload;
            
            const userDoc = await db.collection('users').doc(email).get();
            if (!userDoc.exists) return res.status(404).json({ error: "Użytkownik nie istnieje" });
            
            const userData = userDoc.data();
            const savedSecret = userData.twoFactorSecret;

            // Weryfikacja kodu przez speakeasy
            const verified = speakeasy.totp.verify({
                secret: savedSecret,
                encoding: 'base32',
                token: code,
                window: 1 // Tolerancja +/- 30 sekund na opóźnienia w czasie na telefonie
            });

            if (verified) {
                await db.collection('users').doc(email).update({ status: 'active' });
                return res.status(200).json({ success: true, message: "Autoryzacja pomyślna" });
            } else {
                return res.status(400).json({ success: false, error: "Wprowadzony kod jest niepoprawny lub wygasł" });
            }
        }

        return res.status(404).json({ error: "Nieznana akcja" });

    } catch (error) {
        console.error("BŁĄD BACKENDU:", error);
        return res.status(500).json({ error: error.message });
    }
};
