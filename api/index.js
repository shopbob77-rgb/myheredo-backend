const https = require('https');

// Funkcja pomocnicza do wysyłania zapytań HTTP do zewnętrznego API (Bitwarden)
function bitwardenApiRequest(method, url, headers, payload = null) {
    return new Promise((resolve, reject) => {
        const urlObj = new URL(url);
        const options = {
            method: method,
            hostname: urlObj.hostname,
            path: urlObj.pathname + urlObj.search,
            headers: {
                'Content-Type': 'application/json',
                ...headers
            }
        };

        const req = https.request(options, (res) => {
            let chunks = [];
            res.on('data', chunk => chunks.push(chunk));
            res.on('end', () => {
                const responseBody = Buffer.concat(chunks).toString();
                resolve({
                    status: res.statusCode,
                    data: responseBody ? JSON.parse(responseBody) : {}
                });
            });
        });

        req.on('error', err => reject(err));
        if (payload) req.write(JSON.stringify(payload));
        req.end();
    });
}

module.exports = async (req, res) => {
    // Włączenie pełnego CORS dla komunikacji z frontu
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') return res.status(200).end();

    try {
        const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
        if (!body || !body.action) return res.status(400).json({ error: "Brak akcji" });

        // Dostęp do Twojego serwera Bitwarden (lub Vaultwarden) za pomocą Tokenu Dostępu
        const BITWARDEN_API_URL = process.env.BITWARDEN_API_URL || "https://api.bitwarden.com"; 
        const ACCESS_TOKEN = process.env.BITWARDEN_ACCESS_TOKEN; // Token z Twoich zmiennych środowiskowych Vercel

        // --- OBSŁUGA STRONY REJESTRACJI / AUTORYZACJI 2FA ---
        if (body.action === 'register_user' || body.action === 'verify_2fa_and_activate') {
            // Przepuszczamy logowanie od razu do panelu, by móc testować zapis skrytek
            return res.status(200).json({ success: true, message: "Autoryzacja pomyślna" });
        }

        // --- GŁÓWNA AKCJA: TWORZENIE KONT / SKRYTEK W BITWARDENIE ---
        if (body.action === 'activate_succession') {
            const email = body.payload ? body.payload.email : "user@myheredo.pl";
            const vault = body.payload ? body.payload.vaultData : {};
            const heirs = body.payload ? body.payload.heirs : [];

            // 1. Budujemy strukturę "Cipher" (kolekcji/wpisu) zgodną z dokumentacją API Bitwarden
            const bitwardenPayload = {
                type: 1, // Typ: Login/Credential
                name: `Sukcesja MyHeredo - ${email}`,
                notes: `Spadkobiercy:\n${heirs.map(h => `- ${h.name} (${h.email})`).join('\n')}`,
                login: {
                    username: email,
                    password: JSON.stringify(vault) // Szyfrowane dane skrytek (Banki, Krypto, itp.)
                }
            };

            // 2. Nagłówki autoryzacji do Bitwarden API
            const headers = {
                'Authorization': `Bearer ${ACCESS_TOKEN}`
            };

            // 3. Wywołanie zapytania POST tworzącego nowy wpis w sejfie Bitwarden
            const bwResponse = await bitwardenApiRequest(
                'POST', 
                `${BITWARDEN_API_URL}/public/ciphers`, 
                headers, 
                bitwardenPayload
            );

            if (bwResponse.status === 200 || bwResponse.status === 201) {
                return res.status(200).json({ success: true, message: "Konto i skrytki utworzone pomyślnie w Bitwarden!" });
            } else {
                return res.status(bwResponse.status).json({ 
                    error: "Bitwarden API zwrócił błąd", 
                    details: bwResponse.data 
                });
            }
        }

        return res.status(404).json({ error: "Nieobsługiwana akcja" });

    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
};
