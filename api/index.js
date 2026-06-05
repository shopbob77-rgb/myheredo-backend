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
            const data = body ? JSON.parse(body) : {};
            const { action, vault } = data;

            // Logowanie
            const tokenStr = `grant_type=client_credentials&client_id=${process.env.BW_CLIENT_ID}&client_secret=${process.env.BW_CLIENT_SECRET}`;
            // Znajdź ten fragment w api/index.js i podmień go na:
const tokenRes = await makeHttpsRequest({
    hostname: 'identity.bitwarden.com',
    path: '/connect/token',
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
}, tokenStr);

// TO WYPISZE BŁĄD W LOGACH VERCEL, A NIE W PRZEGLĄDARCE:
console.log("STATUS:", tokenRes.statusCode);
console.log("BODY:", tokenRes.body);

const tokenData = JSON.parse(tokenRes.body);
const token = tokenData.access_token;
            
            const token = JSON.parse(tokenRes.body).access_token;
            if (!token) return res.status(401).json({ error: "Błąd autoryzacji" });

            if (action === "get_vault") {
                return res.status(200).json({ success: true, vaultData: {} });
            }

            // OSTATECZNIE MINIMALISTYCZNY ZAPIS
            // Usuwamy collectionIds oraz skomplikowane obiekty
            const cipher = JSON.stringify({
                type: 2, // Secure Note
                name: "MyHeredo Protokół",
                notes: JSON.stringify(vault || { info: "Protokół wygenerowany" })
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
            
            if (postRes.statusCode >= 200 && postRes.statusCode < 300) {
                return res.status(200).json({ success: true, message: "Zapisano!" });
            } else {
                return res.status(postRes.statusCode).json({ error: "Odrzucono", details: postRes.body });
            }
        } catch (e) {
            return res.status(500).json({ error: e.message });
        }
    });
};
