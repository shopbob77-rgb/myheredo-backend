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
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Bitwarden-Client-Version');

    if (req.method === 'OPTIONS') return res.status(200).end();
    
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
        try {
            const data = body ? JSON.parse(body) : {};
            
            // Pobieranie tokena OAuth z Bitwarden
            const tokenStr = `grant_type=client_credentials&client_id=${process.env.BW_CLIENT_ID}&client_secret=${process.env.BW_CLIENT_SECRET}&scope=api`;
            const tokenRes = await makeHttpsRequest({
                hostname: 'identity.bitwarden.com',
                path: '/connect/token',
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Bitwarden-Client-Version': '2024.0.0' // Wymagane przez API
                }
            }, tokenStr);
            
            const tokenData = JSON.parse(tokenRes.body);
            if (!tokenData.access_token) {
                return res.status(401).json({ error: "Błąd autoryzacji", details: tokenRes.body });
            }

            // Logika zapisu do sejfu
            const cipher = JSON.stringify({
                type: 2,
                name: "MyHeredo Protokół",
                notes: JSON.stringify(data.vault || { info: "Protokół" })
            });

            const cipherOptions = {
                hostname: 'api.bitwarden.com',
                path: '/ciphers',
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${tokenData.access_token}`,
                    'Content-Type': 'application/json',
                    'Device-Type': '1', // Wymagane przez API
                    'Bitwarden-Client-Version': '2024.0.0',
                    'Content-Length': Buffer.byteLength(cipher)
                }
            };

            const postRes = await makeHttpsRequest(cipherOptions, cipher);
            return res.status(postRes.statusCode).json(JSON.parse(postRes.body));
            
        } catch (e) {
            return res.status(500).json({ error: e.message });
        }
    });
};
