module.exports = async (req, res) => {
    // 1. Obsługa CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') return res.status(200).end();

    try {
        // 2. Bezpieczne parsowanie ciała (body)
        const body = req.body || {};
        const action = body.action;

        if (!action) {
            return res.status(200).json({ status: "OK", message: "Brak akcji, serwer aktywny" });
        }

        // 3. Logika zapisu
        if (action === "save_cipher") {
            // Przekazanie danych do Bitwardena
            const response = await fetch('https://api.bitwarden.com/ciphers', {
                method: 'POST',
                headers: {
                    'Authorization': req.headers['authorization'] || '',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(body.data || {})
            });
            const result = await response.json().catch(() => ({}));
            return res.status(response.status).json(result);
        }

        return res.status(200).json({ status: "SUCCESS" });
    } catch (e) {
        return res.status(200).json({ status: "SUCCESS", debug: e.message });
    }
};
