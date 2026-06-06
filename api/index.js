module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();

    try {
        // DIAGNOSTYKA KLUCZY
        if (!process.env.BW_CLIENT_ID || !process.env.BW_CLIENT_SECRET) {
            return res.status(500).json({ 
                error: "Błąd konfiguracji: Klucze nie są wykrywane przez serwer!",
                debug: {
                    id_exists: !!process.env.BW_CLIENT_ID,
                    secret_exists: !!process.env.BW_CLIENT_SECRET
                }
            });
        }

        const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;

        const authResponse = await fetch('https://identity.bitwarden.com/connect/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                grant_type: 'client_credentials',
                client_id: process.env.BW_CLIENT_ID,
                client_secret: process.env.BW_CLIENT_SECRET,
                scope: 'api.organization'
            })
        });

        const authData = await authResponse.json();
        
        if (!authData.access_token) {
            return res.status(500).json({ 
                error: "Nie udało się uzyskać tokena Bitwarden",
                details: authData 
            });
        }

        const accessToken = authData.access_token;

        if (body.action === "get_vault") {
            const listRes = await fetch('https://api.bitwarden.com/ciphers', {
                method: 'GET',
                headers: { 'Authorization': `Bearer ${accessToken}` }
            });
            const vaultData = await listRes.json();
            return res.status(200).json({ status: "SUCCESS", vaultData: vaultData.data || vaultData });
        }

        return res.status(200).json({ status: "OK" });
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
};
