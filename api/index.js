const https = require('https');

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Bitwarden-Client-Version');

    if (req.method === 'OPTIONS') return res.status(200).end();

    const body = await new Promise(resolve => {
        let data = '';
        req.on('data', chunk => data += chunk);
        req.on('end', () => resolve(JSON.parse(data || '{}')));
    });

    // Bitwarden wymaga unikalnego identyfikatora urządzenia dla sesji API
    const DEVICE_ID = "00000000-0000-0000-0000-000000000000"; 

    // Konfiguracja zapytania
    const options = {
        hostname: 'api.bitwarden.com',
        path: '/ciphers',
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Device-Type': '1',
            'Device-Identifier': DEVICE_ID,
            'Bitwarden-Client-Version': '2024.0.0',
            'Authorization': req.headers['authorization'] // Przekazujemy token z frontendu
        }
    };

    const proxyReq = https.request(options, (proxyRes) => {
        let responseData = '';
        proxyRes.on('data', chunk => responseData += chunk);
        proxyRes.on('end', () => {
            res.status(proxyRes.statusCode).json(JSON.parse(responseData || '{}'));
        });
    });

    proxyReq.write(JSON.stringify(body));
    proxyReq.end();
};
