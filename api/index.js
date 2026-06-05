module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();

    try {
        const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;

        // 1. Pobranie Access Tokena (wymiana Client ID i Secret)
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

        // 2. Zapis notatki w Bitwardenie
        if (body.action === "save_cipher") {
            const saveRes = await fetch('https://api.bitwarden.com/ciphers', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    type: 2, // 2 = Secure Note
                    name: "Notatka z MyHeredo",
                    notes: body.data.notes,
                    folderId: null // Opcjonalnie podaj ID folderu
                })
            });

            const result = await saveRes.json();
            return res.status(200).json({ status: "SUCCESS", result });
        }

        return res.status(200).json({ status: "OK" });
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
};
