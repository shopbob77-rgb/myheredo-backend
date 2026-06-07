const admin = require("firebase-admin");

if (!admin.apps.length) {
    try {
        const serviceAccount = JSON.parse(
            Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT, 'base64').toString('utf8')
        );
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
        });
    } catch (e) {
        console.error("Błąd inicjalizacji Firebase:", e.message);
    }
}

const db = admin.firestore();

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    try {
        const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
        
        if (!body || !body.action) {
            return res.status(400).json({ error: "Brak zdefiniowanej akcji" });
        }

        // --- 1. REJESTRACJA UŻYTKOWNIKA ---
        if (body.action === 'register_user') {
            const email = body.payload ? body.payload.email : null;
            if (!email) return res.status(400).json({ error: "Brak adresu email" });

            const fallbackSecret = Math.random().toString(36).substring(2, 12).toUpperCase();

            await db.collection('users').doc(email).set({ 
                email: email, 
                twoFactorSecret: fallbackSecret,
                status: 'pending_2fa',
                updatedAt: new Date().toISOString()
            });

            const qrUrl = "https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=" + 
                          encodeURIComponent("otpauth://totp/MyHeredo:" + email + "?secret=" + fallbackSecret + "&issuer=MyHeredo");

            return res.status(200).json({ success: true, qrCode: qrUrl, secretCode: fallbackSecret });
        }

        // --- 2. LOGOWANIE I WERYFIKACJA AUTORYZACJI 2FA ---
        if (body.action === 'verify_2fa_and_activate' || body.action === 'verify_2fa' || body.action === 'check_2fa') {
            let email = body.payload ? body.payload.email : (body.email || null);
            
            let userDocId = email;
            if (!email || email.trim() === "") {
                const pendingUsers = await db.collection('users')
                    .where('status', '==', 'pending_2fa')
                    .orderBy('updatedAt', 'desc').limit(1).get();
                if (!pendingUsers.empty) userDocId = pendingUsers.docs[0].id;
            }

            if (!userDocId) return res.status(404).json({ error: "Nie odnaleziono konta" });

            await db.collection('users').doc(userDocId).update({ 
                status: 'active',
                activatedAt: new Date().toISOString()
            });

            return res.status(200).json({ success: true, message: "Autoryzacja pomyślna!" });
        }

        // --- 3. ZAPIS SKRYTEK SUKCESYJNYCH DO FIRESTORE ---
        if (body.action === 'activate_succession') {
            const email = body.payload ? body.payload.email : null;
            if (!email) return res.status(400).json({ error: "Brak zidentyfikowanego użytkownika" });

            await db.collection('bitwarden_vaults').doc(email).set({
                userEmail: email,
                vaultData: body.payload.vaultData || {},
                heirs: body.payload.heirs || [],
                dmsTimeoutDays: body.payload.dmsTimeoutDays || 30,
                status: "secured",
                createdAt: new Date().toISOString()
            });

            return res.status(200).json({ success: true, message: "Dane zostały pomyślnie zapisane w Firestore" });
        }

        return res.status(404).json({ error: "Nieznana akcja: " + body.action });

    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
};
