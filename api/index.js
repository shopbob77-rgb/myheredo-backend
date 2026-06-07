const admin = require("firebase-admin");
const https = require("https");
const QRCode = require('qrcode');

// Inicjalizacja Firebase
if (!admin.apps.length) {
    const serviceAccount = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT, 'base64').toString('utf8'));
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}
const db = admin.firestore();

// Funkcja pomocnicza dla Bitwardena
function bitwardenRequest(options, postData) {
    return new Promise((resolve, reject) => {
        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => resolve({ statusCode: res.statusCode, body: JSON.parse(data || '{}') }));
        });
        req.on('error', reject);
        if (postData) req.write(JSON.stringify(postData));
        req.end();
    });
}

module.exports = async (req, res) => {
    // 1. Zabezpieczenie CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') return res.status(200).end();

    let body;
    try {
        body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    } catch (e) {
        return res.status(400).json({ error: "Błędny format JSON" });
    }

    try {
        // 2. Logika Rejestracji
        if (body.action === 'register_user') {
            const { email } = body.payload;
            
            // Zapis w Firebase
            await db.collection('users').doc(email).set({ 
                email, 
                status: 'registered',
                createdAt: new Date().toISOString()
            });

            // Generowanie QR
            const qrData = await QRCode.toDataURL(`https://myheredo.pl/auth?email=${email}`);
            
            return res.status(200).json({ 
                success: true, 
                message: "Użytkownik zarejestrowany",
                qrCode: qrData 
            });
        }

        // 3. Logika Aktywacji Sukcesji (Emergency Access)
        if (body.action === 'activate_succession') {
            // Tutaj użyjesz BW_PERSONAL_TOKEN dla operacji na sejfie
            // ... logika aktywacji ...
            return res.status(200).json({ success: true, message: "System uzbrojony" });
        }

        res.status(404).json({ error: "Nieznana akcja" });

    } catch (error) {
        console.error("Błąd backendu:", error);
        res.status(500).json({ error: error.message });
    }
};
