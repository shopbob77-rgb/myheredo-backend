const https = require('https');

module.exports = async (req, res) => {
    // 1. Zobaczmy, czy zmienne środowiskowe w ogóle istnieją
    const id = process.env.BW_CLIENT_ID;
    const secret = process.env.BW_CLIENT_SECRET;
    
    if (!id || !secret) {
        return res.status(500).json({ error: "BRAK ZMIENNYCH ŚRODOWISKOWYCH W VERCEL!" });
    }

    // 2. Bardzo proste zapytanie o token
    const data = `grant_type=client_credentials&client_id=${id}&client_secret=${secret}&scope=api`;
    
  const options = {
        hostname: 'api.bitwarden.com', // lub identity.bitwarden.com zależnie od wywołania
        path: '/ciphers', // lub /connect/token
        method: 'POST',
        headers: { 
            'Content-Type': 'application/json', // lub application/x-www-form-urlencoded
            'Device-Type': '1',                // <--- TO JEST KLUCZOWE
            'Bitwarden-Client-Version': '2024.0.0' // <--- TO JEST KLUCZOWE
        }
    };

    const request = https.request(options, (response) => {
        let str = '';
        response.on('data', (chunk) => str += chunk);
        response.on('end', () => {
            // Zwracamy status z Bitwarden, żebyśmy wiedzieli czy to wina kluczy
            res.status(200).json({ 
                bitwarden_status: response.statusCode, 
                response: JSON.parse(str) 
            });
        });
    });

    request.on('error', (e) => res.status(500).json({ error: e.message }));
    request.write(data);
    request.end();
};
