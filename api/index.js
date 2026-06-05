const https = require('https');

module.exports = async (req, res) => {
    // Nagłówki dla przeglądarki
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method !== 'POST') return res.status(200).end();

    const data = JSON.parse(req.body || '{}');

    // 1. Pobranie tokena (Uproszczone)
    const authData = `grant_type=client_credentials&client_id=${process.env.BW_CLIENT_ID}&client_secret=${process.env.BW_CLIENT_SECRET}&scope=api`;
    
    const tokenReq = https.request({
        hostname: 'identity.bitwarden.com',
        path: '/connect/token',
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    }, (tokenRes) => {
        let body = '';
        tokenRes.on('data', (d) => body += d);
        tokenRes.on('end', () => {
            const tokenJson = JSON.parse(body);
            
            // JEŚLI TU JEST 401, PROBLEM JEST W KLUCZACH (ID/SECRET)
            if (!tokenJson.access_token) {
                return res.status(401).json({ error: "Auth failed", debug: tokenJson });
            }

            // Sukces autoryzacji - tu wysyłamy odpowiedź do frontendu
            return res.status(200).json({ success: true, token_received: true });
        });
    });

    tokenReq.write(authData);
    tokenReq.end();
};
