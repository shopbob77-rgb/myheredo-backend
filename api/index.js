module.exports = async (req, res) => {
    // Nagłówki CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Bitwarden-Client-Version');

    if (req.method === 'OPTIONS') return res.status(200).end();

    try {
        // 1. Diagnostyka zmiennych środowiskowych
        if (!process.env.BW_CLIENT_ID || !process.env.BW_CLIENT_SECRET) {
            return res.status(500).json({ 
                error: "Błąd konfiguracji: Vercel nie widzi kluczy BW_CLIENT_ID lub BW_CLIENT_SECRET!" 
            });
        }

        const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;

        // Stały identyfikator urządzenia wymagany przez Bitwarden API
        const headers = { 
            'Bitwarden-Client-Version': '2024.1.0',
            'Bitwarden-Device-Name': 'MyHeredo-Server',
            'Bitwarden-Device-Type': 'Web',
            'Bitwarden-Device-Id': '6d4b5a21-9b1e-4c3e-8f2a-5d6b7c8d9e0f'
        };

        // 2. Pobranie Access Tokena
        const authResponse = await fetch('https://identity.bitwarden.com/connect/token', {
            method: 'POST',
            headers: { ...headers, 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                grant_type: 'client_credentials',
                client_id: process.env.BW_CLIENT_ID,
                client_secret: process.env.BW_CLIENT_SECRET,
                scope: 'api'
            })
        });

        const authData = await authResponse.json();
        if (!authData.access_token) {
            return res.status(500).json({ error: "Nie udało się uzyskać tokena", details: authData });
        }

        // 3. Obsługa akcji get_vault
        if (body.action === "get_vault") {
            const listRes = await fetch('https://api.bitwarden.com/ciphers', {
                method: 'GET',
                headers: { ...headers, 'Authorization': `Bearer ${authData.access_token}` }
            });
            const vaultData = await listRes.json();
            return res.status(200).json({ status: "SUCCESS", vaultData: vaultData.data || vaultData });
        }

        return res.status(200).json({ status: "OK" });
    } catch (e) {
        return res.status(500).json({ error: "Wystąpił błąd: " + e.message });
    }
};
