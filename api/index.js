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

            // 1. Pobieranie tokena
            // ... wewnątrz funkcji (tam gdzie robisz tokenRes)
const tokenRes = await makeHttpsRequest({
    hostname: 'identity.bitwarden.com',
    path: '/connect/token',
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
}, tokenStr);

// Kluczowe logowanie:
console.log("STATUS_KODU_TOKENA:", tokenRes.statusCode);
console.log("TRESC_ODPOWIEDZI_TOKENA:", tokenRes.body);

if (tokenRes.statusCode !== 200) {
    return res.status(401).json({ error: "Bitwarden odrzucił dane", details: tokenRes.body });
}
// ... dalej reszta kodu
            
            // Logowanie do Vercel dla celów diagnostycznych
            console.log("Token Status:", tokenRes.statusCode);
            
            const tokenData = JSON.parse(tokenRes.body);
            if (!tokenData.access_token) {
                console.error("Błąd tokena:", tokenRes.body);
                return res.status(401).json({ error: "Błąd autoryzacji" });
            }
            const token = tokenData.access_token;

            if (action === "get_vault") {
                return res.status(200).json({ success: true, vaultData: {} });
            }

            // 2. Przygotowanie danych
            const cipher = JSON.stringify({
                type: 2,
                name: "MyHeredo Protokół",
                notes: JSON.stringify(vault || { info: "Protokół wygenerowany" })
            });

            // 3. Zapis w Bitwarden
            const cipherOptions = {
                hostname: 'api.bitwarden.eu',
                path: '/ciphers',
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                    'Device-Type': '1', 
                    'Content-Length': Buffer.byteLength(cipher)
                }
            };

            const postRes = await makeHttpsRequest(cipherOptions, cipher);
            
            if (postRes.statusCode >= 200 && postRes.statusCode < 300) {
                return res.status(200).json({ success: true, message: "Zapisano!" });
            } else {
                console.error("Bitwarden Save Error:", postRes.body);
                return res.status(postRes.statusCode).json({ error: "Odrzucono przez Bitwarden", details: postRes.body });
            }
        } catch (e) {
            console.error("System Error:", e);
            return res.status(500).json({ error: e.message });
        }
    });
};
