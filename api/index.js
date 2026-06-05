const https = require('https');

function makeHttpsRequest(options, payload = null) {
    return new Promise((resolve, reject) => {
        const req = https.request(options, (res) => {
            let resBody = '';
            res.on('data', (chunk) => resBody += chunk);
            res.on('end', () => resolve({ statusCode: res.statusCode, body: resBody }));
        });
        req.on('error', (err) => reject(err));
        if (payload) req.write(payload);
        req.end();
    });
}

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') return res.status(200).end();
    
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
        try {
            // 1. Parsowanie żądania
            const data = body ? JSON.parse(body) : {};
            const { action, vault } = data;

            // 2. Pobranie tokena z Bitwarden
            const tokenStr = `grant_type=client_credentials&client_id=${process.env.BW_CLIENT_ID}&client_secret=${process.env.BW_CLIENT_SECRET}`;
            const tokenRes = await makeHttpsRequest({
                hostname: 'identity.bitwarden.com',
                path: '/connect/token',
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
            }, tokenStr);

            // Diagnostyka w logach Vercel
            console.log("Token Status:", tokenRes.statusCode);
            
            const tokenData = JSON.parse(tokenRes.body);
            if (!tokenData.access_token) {
                console.error("Błąd autoryzacji - szczegóły:", tokenRes.body);
                return res.status(401).json({ error: "Błąd autoryzacji", details: tokenRes.body });
            }

            if (action === "get_vault") {
                return res.status(200).json({ success: true });
            }

            // 3. Przygotowanie notatki
            const cipher = JSON.stringify({
                type: 2,
                name: "MyHeredo Protokół",
                notes: JSON.stringify(vault || { info: "Brak danych" })
            });

            // 4. Zapis do sejfu
            const cipherOptions = {
                hostname: 'api.bitwarden.com',
                path: '/ciphers',
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${tokenData.access_token}`,
                    'Content-Type': 'application/json',
                    'Device-Type': '1',
                    'Content-Length': Buffer.byteLength(cipher)
                }
            };

            const postRes = await makeHttpsRequest(cipherOptions, cipher);
            
            if (postRes.statusCode >= 200 && postRes.statusCode < 300) {
                return res.status(200).json({ success: true, message: "Zapisano!" });
            } else {
                console.error("Błąd zapisu:", postRes.body);
                return res.status(postRes.statusCode).json({ error: "Odrzucono", details: postRes.body });
            }
        } catch (e) {
            console.error("Błąd krytyczny:", e);
            return res.status(500).json({ error: e.message });
        }
    });
};
