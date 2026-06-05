const https = require('https');

module.exports = async (req, res) => {
    // Nagłówki CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Bitwarden-Client-Version');

    if (req.method === 'OPTIONS') return res.status(200).end();

    // Pobranie ciała zapytania
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
        const payload = body ? JSON.parse(body) : {};

        // Przekazanie zapytania do Bitwarden z wymaganymi nagłówkami
        const options = {
            hostname: 'api.bitwarden.com',
            path: '/ciphers', // lub /sync, zależnie od akcji
            method: 'POST',
            headers: {
                'Authorization': req.headers['authorization'],
                'Content-Type': 'application/json',
                'Device-Type': '1', // Bitwarden widzi to jako aplikację Desktop
                'Bitwarden-Client-Version': '2024.0.0', // Wymagane przez API
                'Content-Length': Buffer.byteLength(JSON.stringify(payload))
            }
        };

        const proxy = https.request(options, (proxyRes) => {
            let data = '';
            proxyRes.on('data', chunk => data += chunk);
            proxyRes.on('end', () => {
                // Jeśli Bitwarden odrzuci, dostaniemy tu status błędu (np. 401, 400)
                res.status(proxyRes.statusCode).json(JSON.parse(data || '{}'));
            });
        });

        proxy.on('error', (err) => res.status(500).json({ error: err.message }));
        proxy.write(JSON.stringify(payload));
        proxy.end();
    });
};
