module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();

    try {
        // DIAGNOSTYKA: Sprawdzenie czy Vercel widzi klucze
        if (!process.env.BW_CLIENT_ID || !process.env.BW_CLIENT_SECRET) {
            return res.status(500).json({ 
                error: "Błąd konfiguracji: Klucze środowiskowe nie są wykrywane przez Vercel!",
                debug: {
                    id_exists: !!process.env.BW_CLIENT_ID,
                    secret_exists: !!process.env.BW_CLIENT_SECRET
                }
            });
        }

        const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;

        // Stały identyfikator urządzenia (wymagany przez Bitwarden API)
        const DEVICE_ID = "6d4b5a21-9b1e-4c3e-8f2a-5d6b7c8d9e0f"; 

        const headers = { 
            'Bitwarden-Client-Version': '2024.1.0',
            'Bitwarden-Device-Name': 'MyHeredo-Server',
            'Bitwarden-Device-Type': 'Web',
            'Bitwarden-Device-Id': DEVICE_ID
        };

        // 1. Pobranie Access Tokena
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
            return res.status(500).json({ 
                error: "Nie udało się uzyskać tokena", 
                details: authData 
            });
        }

        const accessToken = authData.access_token;

        // 2. Obsługa pobierania danych
        if (body.action === "get_vault") {
            const listRes = await fetch('https://api.bitwarden.com/ciphers', {
                method: 'GET',
                headers: { ...headers, 'Authorization': `Bearer ${accessToken}` }
            });
            const vaultData = await listRes.json();
            return res.status(200).json({ status: "SUCCESS", vaultData: vaultData.data || vaultData });
        }

        // 3. Obsługa zapisu notatki
        if (body.action === "save_cipher") {
            const saveRes = await fetch('https://api.bitwarden.com/ciphers', {
                method: 'POST',
                headers: { ...headers, 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    type: 2,
                    name: "Notatka z MyHeredo",
                    notes: body.data.notes,
                    folderId: null
                })
            });
            const result = await saveRes.json();
            return res.status(200).json({ status: "SUCCESS", result });
        }

        return res.status(200).json({ status: "OK" });
    } catch (e) {
        return res.status(500).json({ error: "Wystąpił błąd: " + e.message });
    }
};
