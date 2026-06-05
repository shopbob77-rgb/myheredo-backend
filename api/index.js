const https = require('https');

module.exports = async (req, res) => {
    // 1. Ustawienia CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Bitwarden-Client-Version');

    if (req.method === 'OPTIONS') return res.status(200).end();

    // 2. Pobranie danych od frontendu
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
        const payload = body ? JSON.parse(body) : {};

        // 3. Konfiguracja zapytania z brakującymi nagłówkami
        const options = {
            hostname: 'api.bitwarden.com',
            path: '/ciphers', // Upewnij się, że to właściwa ścieżka dla Twojego celu
            method: 'POST',
            headers: {
                'Authorization': req.headers['authorization'],
                'Content-Type': 'application/json',
                'Device-Type': '1', // KLUCZOWE: 1 oznacza aplikację Desktop
                'Device-Identifier': '00000000-0000-0000-0000-000000000000', // Wymagany identyfikator
                'Bitwarden-Client-Version': '2024.0.0', // KLUCZOWE: wersja klienta
                'Content-Length': Buffer.byteLength(JSON.stringify(payload))
            }
        };

        // 4. Wykonanie zapytania
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
