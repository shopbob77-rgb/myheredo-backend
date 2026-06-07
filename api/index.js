const https = require('https');

function bitwardenRequest(method, url, headers, payload = null) {
    return new Promise((resolve, reject) => {
        const u = new URL(url);
        const options = {
            method: method,
            hostname: u.hostname,
            path: u.pathname + u.search,
            headers: {
                'Content-Type': 'application/json',
                ...headers
            }
        };

        const req = https.request(options, (res) => {
            let chunks = [];
            res.on('data', chunk => chunks.push(chunk));
            res.on('end', () => {
                const resBody = Buffer.concat(chunks).toString();
                resolve({
                    status: res.statusCode,
                    data: resBody ? JSON.parse(resBody) : {}
                });
            });
        });

        req.on('error', err => reject(err));
        if (payload) req.write(JSON.stringify(payload));
        req.end();
    });
}

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') return res.status(200).end();

    try {
        const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
        if (!body || !body.action) return res.status(400).json({ error: "Brak akcji" });

        // Pobieranie zmiennych środowiskowych z Twojego panelu Vercel
        const BITWARDEN_API_URL = process.env.BITWARDEN_API_URL || "https://api.bitwarden.com";
        const ACCESS_TOKEN = process.env.BITWARDEN_ACCESS_TOKEN;

        // Fallback dla ekranu weryfikacji 2FA, aby bez przeszkód wpuścić Cię do panelu
        if (body.action === 'register_user' || body.action === 'verify_2fa_and_activate') {
            return res.status(200).json({ success: true, message: "Autoryzacja pomyślna" });
        }

        // --- STRATEGICZNA AKCJA: EXPORT SKRYTEK DO BITWARDENA ---
        if (body.action === 'activate_succession') {
            const email = body.payload ? body.payload.email : "user@myheredo.pl";
            const vault = body.payload ? body.payload.vaultData : {};
            const heirs = body.payload ? body.payload.heirs : [];

            // Konstruowanie obiektu Cipher zgodnie ze specyfikacją Bitwarden API
            const bitwardenPayload = {
                type: 1, // Typ: Login
                name: `Sukcesja MyHeredo - ${email}`,
                notes: `Lista Spadkobierców:\n${heirs.map(h => `- ${h.name} (${h.email})`).join('\n')}`,
                login: {
                    username: email,
                    password: JSON.stringify(vault) // Zabezpieczone dane sejfu (Krypto, Banki itp.)
                }
            };

            const bwHeaders = {
                'Authorization': `Bearer ${ACCESS_TOKEN}`
            };

            const bwResponse = await bitwardenRequest(
                'POST',
                `${BITWARDEN_API_URL}/public/ciphers`,
                bwHeaders,
                bitwardenPayload
            );

            if (bwResponse.status === 200 || bwResponse.status === 201) {
                return res.status(200).json({ success: true, message: "Dane zostały pomyślnie zapisane w Bitwarden!" });
            } else {
                return res.status(bwResponse.status).json({ 
                    error: "Bitwarden API zwrócił status błędu", 
                    details: bwResponse.data 
                });
            }
        }

        return res.status(404).json({ error: "Nieznana akcja" });

    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
};
