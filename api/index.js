const https = require('https');

module.exports = async (req, res) => {
    // Nagłówki CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Bitwarden-Client-Version');

    if (req.method === 'OPTIONS') return res.status(200).end();

    // Pobranie danych z requestu
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
        const payload = body ? JSON.parse(body) : {};

        // Konfiguracja zapytania do Bitwarden
        const options = {
            hostname: 'api.bitwarden.com',
            path: '/ciphers', // lub inny endpoint
            method: 'POST',
            headers: {
                'Authorization': req.headers['authorization'],
                'Content-Type': 'application/json',
                'Device-Type': '1', // Wymagane: typ urządzenia (1 = Desktop)
                'Bitwarden-Client-Version': '2024.0.0', // Wymagane: wersja klienta
                'Content-Length': Buffer.byteLength(JSON.stringify(payload))
            }
        };

        const proxy = https.request(options, (proxyRes) => {
            let responseData = '';
            proxyRes.on('data', chunk => responseData += chunk);
            proxyRes.on('end', () => {
                res.status(proxyRes.statusCode).json(JSON.parse(responseData || '{}'));
            });
        });

        proxy.on('error', (err) => res.status(500).json({ error: err.message }));
        proxy.write(JSON.stringify(payload));
        proxy.end();
    });
};
