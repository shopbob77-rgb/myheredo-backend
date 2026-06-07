const admin = require("firebase-admin");
const QRCode = require('qrcode');
const speakeasy = require('speakeasy');

if (!admin.apps.length) {
    const serviceAccount = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT, 'base64').toString('utf8'));
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}
const db = admin.firestore();

module.exports = async (req, res) => {
    // Uniwersalne nagłówki CORS dla eliminacji błędów blokowania zapytań
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') return res.status(200).end();

    try {
        const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
        
        if (!body || !body.action) {
            return res.status(400).json({ error: "Brak zdefiniowanej akcji" });
        }

        // --- REJESTRACJA UŻYTKOWNIKA ---
        if (body.action === 'register_user') {
            const email = body.payload ? body.payload.email : null;
            if (!email) return res.status(400).json({ error: "Brak adresu email" });

            const secret = speakeasy.generateSecret({ name: `MyHeredo (${email})` });

            await db.collection('users').doc(email).set({ 
                email: email, 
                twoFactorSecret: secret.base32,
                status: 'pending_2fa',
                updatedAt: new Date().toISOString()
            });

            const qrData = await QRCode.toDataURL(secret.otpauth_url);
            return res.status(200).json({ success: true, qrCode: qrData, secretCode: secret.base32 });
        }

        // --- WERYFIKACJA 2FA (Obsługuje każdą nazwę akcji z Twojego frontendu) ---
        if (body.action === 'verify_2fa_and_activate' || body.action === 'verify_2fa' || body.action === 'check_2fa') {
            let email = body.payload ? body.payload.email : (body.email || null);
            let code = null;

            if (body.payload && body.payload.code) code = body.payload.code;
            else if (body.code) code = body.code;
            else {
                // Skanowanie całego obiektu w poszukiwaniu ciągu 6 cyfr wpisanych przez użytkownika
                const match = JSON.stringify(body).match(/\b\d{6}\b/);
                if (match) code = match[0];
            }

            if (!code) {
                return res.status(400).json({ error: "Wprowadź 6-cyfrowy kod z aplikacji" });
            }

            let savedSecret = null;
            let userDocId = email;

            // Koło ratunkowe na wypadek zagubienia adresu email przez formularz frontendu
            if (!email || email.trim() === "") {
                const pendingUsers = await db.collection('users')
                    .where('status', '==', 'pending_2fa')
                    .orderBy('updatedAt', 'desc').limit(1).get();

                if (!pendingUsers.empty) {
                    userDocId = pendingUsers.docs[0].id;
                    savedSecret = pendingUsers.docs[0].data().twoFactorSecret;
                }
            } else {
                const userDoc = await db.collection('users').doc(email).get();
                if (userDoc.exists) savedSecret = userDoc.data().twoFactorSecret;
            }

            if (!savedSecret) {
                return res.status(404).json({ error: "Nie odnaleziono aktywnej sesji" });
            }

            const verified = speakeasy.totp.verify({
                secret: savedSecret,
                encoding: 'base32',
                token: code.toString().trim(),
                window: 4 // Tolerancja +/- 2 minuty desynchronizacji zegara
            });

            if (verified) {
                await db.collection('users').doc(userDocId).update({ 
                    status: 'active',
                    activatedAt: new Date().toISOString()
                });
                return res.status(200).json({ success: true, message: "Autoryzacja pomyślna!" });
            } else {
                return res.status(400).json({ success: false, error: "Wprowadzony kod jest niepoprawny" });
            }
        }

        return res.status(404).json({ error: `Nieznana akcja: ${body.action}` });

    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
};
