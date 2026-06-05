const https = require('https');

// Funkcja pomocnicza do wykonywania żądań HTTPS
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
    // Nagłówki CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') return res.status(200).end();
    
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
        try {
            const data = JSON.parse(body);
            const { action, vault } = data;

            // 1. Logowanie OAuth2
            const tokenStr = `grant_type=client_credentials&client_id=${process.env.BW_CLIENT_ID}&client_secret=${process.env.BW_CLIENT_SECRET}`;
            const tokenRes = await makeHttpsRequest({
                hostname: 'identity.bitwarden.com',
                path: '/connect/token',
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
            }, tokenStr);
            
            const token = JSON.parse(tokenRes.body).access_token;
            if (!token) return res.status(401).json({ error: "Nieudana autoryzacja API." });

            if (action === "get_vault") {
                return res.status(200).json({ success: true, vaultData: {} });
            }

            // 2. Zapis danych bezpośrednio w notatkach (notes), bez pól niestandardowych (fields)
            const cipher = JSON.stringify({
                type: 2,
                name: "MyHeredo Protokół",
                notes: JSON.stringify(vault || { data: "puste" }),
                organizationId: process.env.BW_ORGANIZATION_ID,
                secureNote: { type: 0 }
            });

            const cipherOptions = {
                hostname: 'api.bitwarden.com',
                path: '/ciphers',
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(cipher)
                }
            };

            const postRes = await makeHttpsRequest(cipherOptions, cipher);
            return res.status(postRes.statusCode).json({ status: postRes.statusCode, response: postRes.body });

        } catch (e) {
            return res.status(500).json({ error: e.message });
        }
    });
};
