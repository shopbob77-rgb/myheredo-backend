const admin = require("firebase-admin");
const QRCode = require('qrcode');

if (!admin.apps.length) {
    const serviceAccount = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT, 'base64').toString('utf8'));
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}
const db = admin.firestore();

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();

    try {
        const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
        console.log("Otrzymano żądanie:", body.action);

        if (body.action === 'register_user') {
            // POPRAWKA: bezpieczne wyciągnięcie emaila
            const email = body.payload ? body.payload.email : null;
            
            if (!email) {
                return res.status(400).json({ error: "Brak adresu email w żądaniu" });
            }

            console.log("Rejestracja dla:", email);
            await db.collection('users').doc(email).set({ email, status: 'registered' });

            const qrData = await QRCode.toDataURL(`https://myheredo.pl/auth?email=${email}`);
            return res.status(200).json({ success: true, qrCode: qrData });
        }

        return res.status(404).json({ error: "Nieznana akcja" });

    } catch (error) {
        console.error("BŁĄD BACKENDU:", error);
        return res.status(500).json({ error: error.message });
    }
};
