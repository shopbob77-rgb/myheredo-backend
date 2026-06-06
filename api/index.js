module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();

    try {
        const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;

        // 1. Pobranie Access Tokena
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
        const accessToken = authData.access_token;

        if (!accessToken) throw new Error("Nie udało się uzyskać tokena Bitwarden");

        // 2. Obsługa pobierania danych (Nowa funkcja)
        if (body.action === "get_vault") {
            const listRes = await fetch('https://api.bitwarden.com/ciphers', {
                method: 'GET',
                headers: { 'Authorization': `Bearer ${accessToken}` }
            });
            const vaultData = await listRes.json();
            return res.status(200).json({ 
                status: "SUCCESS", 
                vaultData: vaultData.data || vaultData 
            });
        }

        // 3. Obsługa zapisu notatki
        if (body.action === "save_cipher") {
            const saveRes = await fetch('https://api.bitwarden.com/ciphers', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                },
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

        return res.status(200).json({ status: "OK", message: "Brak zdefiniowanej akcji" });
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
};
