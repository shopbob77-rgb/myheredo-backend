const admin = require("firebase-admin");
const QRCode = require('qrcode');
const { authenticator } = require('otplib'); // Biblioteka do obsługi prawdziwego 2FA

if (!admin.apps.length) {
    const serviceAccount = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT, 'base64').toString('utf8'));
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}
const db = admin.firestore();

module.exports = async (req, res) => {
    // Obsługa CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') return res.status(200).end();

    try {
        const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;

        // --- AKCJA 1: REJESTRACJA I GENEROWANIE PRAWDZIWEGO 2FA ---
        if (body.action === 'register_user') {
            const email = body.payload ? body.payload.email : null;
            if (!email) return res.status(400).json({ error: "Brak adresu email" });

            // 1. Generujemy tajny klucz (Secret) dla Google Authenticator
            const secret = authenticator.generateSecret();

            // 2. Tworzymy oficjalny link standardu OTPAuth, który aplikacje 2FA potrafią odczytać
            // Format: otpauth://totp/[NazwaAplikacji]:[Email]?secret=[Klucz]&issuer=[NazwaAplikacji]
            const otpauthUrl = authenticator.keyuri(email, 'MyHeredo', secret);

            // 3. Zapisujemy użytkownika oraz jego SECRET w bazie Firebase
            await db.collection('users').doc(email).set({ 
                email: email, 
                twoFactorSecret: secret, // To posłuży do późniejszej weryfikacji kodu
                status: 'pending_2fa',
                createdAt: new Date().toISOString()
            });

            // 4. Generujemy kod QR z poprawnego linku OTPAuth
            const qrData = await QRCode.toDataURL(otpauthUrl);

            return res.status(200).json({ 
                success: true, 
                qrCode: qrData,
                secretCode: secret // Przekazujemy też tekstowo, gdyby użytkownik chciał wpisać klucz ręcznie
            });
        }

        // --- AKCJA 2: WERYFIKACJA 6-CYFROWEGO KODU ---
        if (body.action === 'verify_2fa') {
            const { email, code } = body.payload;
            
            // Pobieramy dane użytkownika z Firebase, żeby wyciągnąć jego "secret"
            const userDoc = await db.collection('users').doc(email).get();
            if (!userDoc.exists) return res.status(404).json({ error: "Użytkownik nie istnieje" });
            
            const userData = userDoc.data();
            const secret = userData.twoFactorSecret;

            // Sprawdzamy, czy kod wpisany przez użytkownika zgadza się z kluczem w bazie
            const isValid = authenticator.check(code, secret);

            if (isValid) {
                // Kod poprawny! Aktywujemy konto w Firebase
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
