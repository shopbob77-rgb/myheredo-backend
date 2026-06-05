const https = require('https');

module.exports = async (req, res) => {
    // 1. Zawsze zezwalaj na połączenie z Twoją domeną (CORS)
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Bitwarden-Client-Version');

    if (req.method === 'OPTIONS') return res.status(200).end();

    // 2. Pobierz dane z zapytania
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
        const payload = body;

        // 3. Skonfiguruj połączenie do Bitwarden
        const options = {
            hostname: 'api.bitwarden.com',
            path: '/ciphers', // lub /sync, zależnie od tego, co chcesz zrobić
            method: 'POST',
            headers: {
                'Authorization': req.headers['authorization'],
                'Content-Type': 'application/json',
                'Device-Type': '1', // TO JEST KLUCZOWE: 1 = Desktop
                'Bitwarden-Client-Version': '2024.0.0', // TO JEST KLUCZOWE
                'Device-Identifier': '00000000-0000-0000-0000-000000000000'
            }
        };

        const proxy = https.request(options, (proxyRes) => {
            let data = '';
            proxyRes.on('data', chunk => data += chunk);
            proxyRes.on('end', () => {
                res.status(proxyRes.statusCode).json(JSON.parse(data || '{}'));
            });
        });

        proxy.on('error', (err) => res.status(500).json({ error: err.message }));
        proxy.write(payload);
        proxy.end();
    });
};
